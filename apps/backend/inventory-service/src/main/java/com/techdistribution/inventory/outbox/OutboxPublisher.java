package com.techdistribution.inventory.outbox;

import java.net.InetAddress;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * Publica el outbox hacia Kafka (docs/architecture/event-driven-communication.md):
 * <ul>
 *   <li>solo el evento de menor versión pendiente de cada producto es candidato,
 *       así el orden por agregado se conserva incluso con varias instancias;</li>
 *   <li>cada fila se reclama con un lease; uno vencido puede recuperarse;</li>
 *   <li>la fila se marca PUBLISHED solo tras el acknowledgement de Kafka
 *       (productor idempotente con acks=all);</li>
 *   <li>un fallo devuelve la fila a PENDING con backoff exponencial y jitter.</li>
 * </ul>
 */
@Component
public class OutboxPublisher {

    private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);
    private static final long MAX_BACKOFF_SECONDS = 60;
    private static final int MAX_ERROR_LENGTH = 1000;

    private final JdbcClient jdbc;
    private final KafkaTemplate<String, String> kafka;
    private final OutboxProperties properties;
    private final Clock clock;
    private final String instanceId;

    public OutboxPublisher(
            JdbcClient jdbc, KafkaTemplate<String, String> kafka, OutboxProperties properties, Clock clock) {
        this.jdbc = jdbc;
        this.kafka = kafka;
        this.properties = properties;
        this.clock = clock;
        this.instanceId = hostname() + ":" + UUID.randomUUID();
    }

    record Candidate(UUID eventId, String aggregateId, long entityVersion, String topic, String partitionKey,
            String payload) {
    }

    /** Publica lotes hasta vaciar los candidatos disponibles; devuelve cuántos publicó. */
    public int publishPending() {
        int published = 0;
        while (true) {
            List<Candidate> batch = findCandidates();
            if (batch.isEmpty()) {
                return published;
            }
            int sentInBatch = 0;
            for (Candidate candidate : batch) {
                if (claim(candidate) && send(candidate)) {
                    sentInBatch++;
                }
            }
            published += sentInBatch;
            if (sentInBatch == 0) {
                // Todo el lote falló o lo reclamó otra instancia: reintentar en el próximo ciclo.
                return published;
            }
        }
    }

    /** Elimina filas publicadas fuera del periodo de retención operativa. */
    public int purgePublished() {
        LocalDateTime cutoff = toDb(clock.instant().minus(properties.retentionDays(), ChronoUnit.DAYS));
        return jdbc.sql("DELETE FROM outbox_events WHERE status = 'PUBLISHED' AND published_at < :cutoff")
                .param("cutoff", cutoff)
                .update();
    }

    private List<Candidate> findCandidates() {
        Instant now = clock.instant();
        return jdbc.sql("""
                SELECT BIN_TO_UUID(o.event_id) AS event_id, BIN_TO_UUID(o.aggregate_id) AS aggregate_id,
                       o.entity_version, o.topic, o.partition_key, CAST(o.payload AS CHAR) AS payload
                FROM outbox_events o
                WHERE o.status <> 'PUBLISHED'
                  AND o.entity_version = (
                      SELECT MIN(i.entity_version) FROM outbox_events i
                      WHERE i.aggregate_id = o.aggregate_id AND i.status <> 'PUBLISHED')
                  AND o.next_attempt_at <= :now
                  AND (o.status = 'PENDING' OR o.locked_at < :leaseExpiry)
                ORDER BY o.created_at, o.entity_version
                LIMIT :limit
                """)
                .param("now", toDb(now))
                .param("leaseExpiry", toDb(now.minusSeconds(properties.leaseSeconds())))
                .param("limit", properties.batchSize())
                .query((rs, row) -> new Candidate(
                        UUID.fromString(rs.getString("event_id")),
                        rs.getString("aggregate_id"),
                        rs.getLong("entity_version"),
                        rs.getString("topic"),
                        rs.getString("partition_key"),
                        rs.getString("payload")))
                .list();
    }

    private boolean claim(Candidate candidate) {
        Instant now = clock.instant();
        int updated = jdbc.sql("""
                UPDATE outbox_events
                SET status = 'PUBLISHING', locked_at = :now, locked_by = :instance
                WHERE event_id = UUID_TO_BIN(:eventId)
                  AND status <> 'PUBLISHED'
                  AND (status = 'PENDING' OR locked_at < :leaseExpiry)
                """)
                .param("now", toDb(now))
                .param("instance", instanceId)
                .param("eventId", candidate.eventId().toString())
                .param("leaseExpiry", toDb(now.minusSeconds(properties.leaseSeconds())))
                .update();
        return updated == 1;
    }

    private boolean send(Candidate candidate) {
        try {
            kafka.send(candidate.topic(), candidate.partitionKey(), candidate.payload())
                    .get(properties.sendTimeoutSeconds(), TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            release(candidate, exception);
            return false;
        } catch (ExecutionException | java.util.concurrent.TimeoutException | RuntimeException exception) {
            release(candidate, exception);
            return false;
        }
        jdbc.sql("""
                UPDATE outbox_events
                SET status = 'PUBLISHED', published_at = :now, locked_at = NULL, locked_by = NULL,
                    last_error = NULL
                WHERE event_id = UUID_TO_BIN(:eventId) AND locked_by = :instance
                """)
                .param("now", toDb(clock.instant()))
                .param("eventId", candidate.eventId().toString())
                .param("instance", instanceId)
                .update();
        log.debug("Evento {} v{} publicado en {}", candidate.aggregateId(), candidate.entityVersion(),
                candidate.topic());
        return true;
    }

    private void release(Candidate candidate, Exception exception) {
        Integer attempts = jdbc.sql("SELECT attempt_count FROM outbox_events WHERE event_id = UUID_TO_BIN(:eventId)")
                .param("eventId", candidate.eventId().toString())
                .query(Integer.class)
                .optional()
                .orElse(0);
        Duration backoff = backoff(attempts + 1);
        String error = sanitize(exception);
        log.warn("No se pudo publicar el evento {} (intento {}); se reintentará en {} ms: {}",
                candidate.eventId(), attempts + 1, backoff.toMillis(), error);
        jdbc.sql("""
                UPDATE outbox_events
                SET status = 'PENDING', attempt_count = attempt_count + 1, next_attempt_at = :next,
                    locked_at = NULL, locked_by = NULL, last_error = :error
                WHERE event_id = UUID_TO_BIN(:eventId) AND locked_by = :instance
                """)
                .param("next", toDb(clock.instant().plus(backoff)))
                .param("error", error)
                .param("eventId", candidate.eventId().toString())
                .param("instance", instanceId)
                .update();
    }

    /** 1, 2, 4, 8... segundos con tope de 60 s, más hasta 1 s de jitter. */
    static Duration backoff(int attempt) {
        long seconds = Math.min(MAX_BACKOFF_SECONDS, 1L << Math.min(attempt - 1, 6));
        return Duration.ofSeconds(seconds).plusMillis(ThreadLocalRandom.current().nextLong(0, 1000));
    }

    private static String sanitize(Exception exception) {
        Throwable root = exception instanceof ExecutionException && exception.getCause() != null
                ? exception.getCause()
                : exception;
        String text = root.getClass().getSimpleName()
                + (root.getMessage() == null ? "" : ": " + root.getMessage());
        text = text.replaceAll("\\s+", " ").strip();
        return text.length() > MAX_ERROR_LENGTH ? text.substring(0, MAX_ERROR_LENGTH) : text;
    }

    private static LocalDateTime toDb(Instant instant) {
        return LocalDateTime.ofInstant(instant.truncatedTo(ChronoUnit.MICROS), ZoneOffset.UTC);
    }

    private static String hostname() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception exception) {
            return "inventory";
        }
    }
}
