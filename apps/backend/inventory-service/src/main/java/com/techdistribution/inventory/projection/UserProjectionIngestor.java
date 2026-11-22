package com.techdistribution.inventory.projection;

import com.techdistribution.inventory.common.api.UtcTimestamps;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Aplica un snapshot de usuario: en una sola transacción registra el evento en
 * inbox_events y actualiza user_projections solo si la versión es mayor. Los
 * duplicados no cambian nada y las versiones antiguas quedan como IGNORED_STALE.
 */
@Component
public class UserProjectionIngestor {

    public enum Outcome { APPLIED, IGNORED_STALE, DUPLICATE }

    /** Posición Kafka del mensaje; se guarda en la inbox para trazabilidad. */
    public record Position(String consumerGroup, String topic, int partition, long offset) {
    }

    private final JdbcClient jdbc;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public UserProjectionIngestor(JdbcClient jdbc, JsonMapper jsonMapper, Clock clock) {
        this.jdbc = jdbc;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    @Transactional
    public Outcome ingest(UserEvent event, String rawPayload, Position position) {
        boolean alreadyProcessed = jdbc.sql("SELECT COUNT(*) FROM inbox_events WHERE event_id = UUID_TO_BIN(:id)")
                .param("id", event.eventId().toString())
                .query(Long.class)
                .single() > 0;
        if (alreadyProcessed) {
            return Outcome.DUPLICATE;
        }

        LocalDateTime now = toDb(UtcTimestamps.truncate(clock.instant()));
        Optional<Long> current = jdbc.sql(
                        "SELECT entity_version FROM user_projections WHERE user_id = UUID_TO_BIN(:id) FOR UPDATE")
                .param("id", event.userId().toString())
                .query(Long.class)
                .optional();

        Outcome outcome;
        if (current.isEmpty()) {
            insertProjection(event, now);
            outcome = Outcome.APPLIED;
        } else if (event.entityVersion() > current.get()) {
            updateProjection(event, now);
            outcome = Outcome.APPLIED;
        } else {
            outcome = Outcome.IGNORED_STALE;
        }
        insertInbox(event, rawPayload, position, outcome, now);
        return outcome;
    }

    private void insertProjection(UserEvent event, LocalDateTime now) {
        jdbc.sql("""
                INSERT INTO user_projections (user_id, email, display_name, active, assignments, entity_version,
                                              source_event_id, source_event_at, projected_at)
                VALUES (UUID_TO_BIN(:userId), :email, :displayName, :active, :assignments, :version,
                        UUID_TO_BIN(:eventId), :eventAt, :now)
                """)
                .params(projectionParams(event, now))
                .update();
    }

    private void updateProjection(UserEvent event, LocalDateTime now) {
        jdbc.sql("""
                UPDATE user_projections
                SET email = :email, display_name = :displayName, active = :active, assignments = :assignments,
                    entity_version = :version, source_event_id = UUID_TO_BIN(:eventId),
                    source_event_at = :eventAt, projected_at = :now
                WHERE user_id = UUID_TO_BIN(:userId)
                """)
                .params(projectionParams(event, now))
                .update();
    }

    private Map<String, Object> projectionParams(UserEvent event, LocalDateTime now) {
        List<Map<String, String>> assignments = event.assignments().stream()
                .map(assignment -> Map.of("system", assignment.system(), "role", assignment.role()))
                .toList();
        return Map.of(
                "userId", event.userId().toString(),
                "email", event.email(),
                "displayName", event.displayName(),
                "active", event.active(),
                "assignments", jsonMapper.writeValueAsString(assignments),
                "version", event.entityVersion(),
                "eventId", event.eventId().toString(),
                "eventAt", toDb(event.occurredAt()),
                "now", now);
    }

    private void insertInbox(UserEvent event, String rawPayload, Position position, Outcome outcome,
            LocalDateTime now) {
        jdbc.sql("""
                INSERT INTO inbox_events (event_id, consumer_group, topic, partition_number, offset_value,
                                          aggregate_id, event_type, schema_version, entity_version,
                                          correlation_id, event_occurred_at, payload_hash, outcome, processed_at)
                VALUES (UUID_TO_BIN(:eventId), :group, :topic, :partition, :offset, UUID_TO_BIN(:aggregateId),
                        :eventType, 1, :version, UUID_TO_BIN(:correlationId), :occurredAt, :hash, :outcome, :now)
                """)
                .param("eventId", event.eventId().toString())
                .param("group", position.consumerGroup())
                .param("topic", position.topic())
                .param("partition", position.partition())
                .param("offset", position.offset())
                .param("aggregateId", event.userId().toString())
                .param("eventType", event.eventType())
                .param("version", event.entityVersion())
                .param("correlationId", event.correlationId().toString())
                .param("occurredAt", toDb(event.occurredAt()))
                .param("hash", sha256(rawPayload))
                .param("outcome", outcome.name())
                .param("now", now)
                .update();
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static LocalDateTime toDb(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
