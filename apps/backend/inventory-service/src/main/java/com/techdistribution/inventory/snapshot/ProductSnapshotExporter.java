package com.techdistribution.inventory.snapshot;

import com.techdistribution.inventory.common.api.UtcTimestamps;
import com.techdistribution.inventory.outbox.OutboxProperties;
import com.techdistribution.inventory.outbox.OutboxPublisher;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.TopicPartition;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Exporta un snapshot consistente del catálogo para reconstruir proyecciones
 * después de la retención de Kafka (docs/architecture/event-driven-communication.md):
 * <ol>
 *   <li>drena el outbox: todo cambio confirmado queda publicado en Kafka;</li>
 *   <li>lee los productos en una sola transacción;</li>
 *   <li>captura el watermark: último offset de cada partición del tópico.</li>
 * </ol>
 * Debe ejecutarse con Inventory detenido, para que no haya escrituras entre los
 * pasos. El archivo usa el formato de {@code import_projection_snapshot} de Purchases.
 */
@Component
public class ProductSnapshotExporter {

    private static final int MAX_DRAIN_ROUNDS = 5;

    public record Report(int products, Map<Integer, Long> watermarks, Path file) {
    }

    private final JdbcClient jdbc;
    private final OutboxPublisher publisher;
    private final OutboxProperties outbox;
    private final KafkaAdmin kafkaAdmin;
    private final TransactionTemplate readSnapshot;
    private final JsonMapper jsonMapper;

    public ProductSnapshotExporter(JdbcClient jdbc, OutboxPublisher publisher, OutboxProperties outbox,
            KafkaAdmin kafkaAdmin, org.springframework.transaction.PlatformTransactionManager transactions,
            JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.publisher = publisher;
        this.outbox = outbox;
        this.kafkaAdmin = kafkaAdmin;
        this.jsonMapper = jsonMapper;
        this.readSnapshot = new TransactionTemplate(transactions);
        this.readSnapshot.setIsolationLevel(Isolation.REPEATABLE_READ.value());
        this.readSnapshot.setReadOnly(true);
    }

    public Report export(Path file) {
        drainOutbox();
        List<Map<String, Object>> items = readSnapshot.execute(status -> readProducts());
        Map<Integer, Long> watermarks = captureWatermarks();

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("domain", "product");
        snapshot.put("topic", outbox.topic());
        snapshot.put("exportedAt", UtcTimestamps.format(UtcTimestamps.now()));
        Map<String, Long> watermarkJson = new LinkedHashMap<>();
        watermarks.forEach((partition, offset) -> watermarkJson.put(String.valueOf(partition), offset));
        snapshot.put("watermarks", watermarkJson);
        snapshot.put("items", items);
        write(file, jsonMapper.writerWithDefaultPrettyPrinter().writeValueAsString(snapshot));
        return new Report(items.size(), watermarks, file);
    }

    /** Publica todo lo pendiente; si Kafka no confirma, el snapshot no sería consistente. */
    private void drainOutbox() {
        long leased = jdbc.sql("""
                SELECT COUNT(*) FROM outbox_events
                WHERE status = 'PUBLISHING' AND locked_at >= UTC_TIMESTAMP(6) - INTERVAL :lease SECOND
                """).param("lease", outbox.leaseSeconds()).query(Long.class).single();
        if (leased > 0) {
            throw new SnapshotException("Hay eventos en publicación por otra instancia de Inventory. "
                    + "Detén el servicio antes de exportar.");
        }
        for (int round = 0; round < MAX_DRAIN_ROUNDS && pendingEvents() > 0; round++) {
            // Sin esperar el backoff: el export se ejecuta con el servicio detenido.
            jdbc.sql("UPDATE outbox_events SET next_attempt_at = UTC_TIMESTAMP(6) WHERE status = 'PENDING'").update();
            publisher.publishPending();
        }
        long pending = pendingEvents();
        if (pending > 0) {
            throw new SnapshotException("No se pudieron publicar " + pending
                    + " eventos pendientes del outbox. Revisa que Kafka esté disponible.");
        }
    }

    private long pendingEvents() {
        return jdbc.sql("SELECT COUNT(*) FROM outbox_events WHERE status <> 'PUBLISHED'")
                .query(Long.class).single();
    }

    private List<Map<String, Object>> readProducts() {
        return jdbc.sql("""
                SELECT BIN_TO_UUID(p.id) AS product_id, p.sku, p.name, p.unit, p.stock_on_hand, p.active,
                       BIN_TO_UUID(p.created_by) AS created_by, BIN_TO_UUID(p.updated_by) AS updated_by,
                       p.version, BIN_TO_UUID(o.event_id) AS source_event_id, o.occurred_at AS source_event_at
                FROM products p
                LEFT JOIN outbox_events o ON o.aggregate_id = p.id AND o.entity_version = p.version
                ORDER BY p.sku
                """)
                .query((rs, row) -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("productId", rs.getString("product_id"));
                    item.put("sku", rs.getString("sku"));
                    item.put("name", rs.getString("name"));
                    item.put("unit", rs.getString("unit"));
                    item.put("stockOnHand", rs.getLong("stock_on_hand"));
                    item.put("active", rs.getBoolean("active"));
                    item.put("createdBy", rs.getString("created_by"));
                    item.put("updatedBy", rs.getString("updated_by"));
                    item.put("entityVersion", rs.getLong("version"));
                    // El evento puede haberse purgado (retención de 30 días): el importador acepta null.
                    item.put("sourceEventId", rs.getString("source_event_id"));
                    LocalDateTime eventAt = rs.getObject("source_event_at", LocalDateTime.class);
                    item.put("sourceEventAt", eventAt == null ? null
                            : UtcTimestamps.format(eventAt.toInstant(ZoneOffset.UTC)));
                    return item;
                })
                .list();
    }

    private Map<Integer, Long> captureWatermarks() {
        try (Admin admin = Admin.create(kafkaAdmin.getConfigurationProperties())) {
            TopicDescription topic = admin.describeTopics(List.of(outbox.topic()))
                    .allTopicNames().get().get(outbox.topic());
            Map<TopicPartition, OffsetSpec> request = new LinkedHashMap<>();
            topic.partitions().forEach(p -> request.put(new TopicPartition(outbox.topic(), p.partition()),
                    OffsetSpec.latest()));
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> offsets =
                    admin.listOffsets(request).all().get();
            Map<Integer, Long> watermarks = new TreeMap<>();
            // Watermark = último offset incluido (-1 si la partición está vacía).
            offsets.forEach((partition, info) -> watermarks.put(partition.partition(), info.offset() - 1));
            return watermarks;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new SnapshotException("Lectura de offsets interrumpida");
        } catch (Exception exception) {
            throw new SnapshotException("No se pudieron leer los offsets de " + outbox.topic() + ": "
                    + exception.getMessage());
        }
    }

    private static void write(Path file, String content) {
        try {
            Path absolute = file.toAbsolutePath();
            if (absolute.getParent() != null) {
                Files.createDirectories(absolute.getParent());
            }
            Path temporary = Files.createTempFile(absolute.getParent(), "product-snapshot", ".tmp");
            Files.writeString(temporary, content, StandardCharsets.UTF_8);
            Files.move(temporary, absolute, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException exception) {
            throw new SnapshotException("No se pudo escribir " + file + ": " + exception.getMessage());
        }
    }
}
