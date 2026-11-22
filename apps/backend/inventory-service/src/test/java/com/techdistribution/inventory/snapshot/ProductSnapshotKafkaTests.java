package com.techdistribution.inventory.snapshot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.outbox.OutboxPublisher;
import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.KafkaTestcontainer;
import com.techdistribution.inventory.support.Tokens;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

/**
 * Criterio de aceptación: snapshot + eventos posteriores al watermark reproducen
 * exactamente el estado actual del catálogo.
 */
@Import(KafkaTestcontainer.class)
class ProductSnapshotKafkaTests extends IntegrationTest {

    private static final String TOPIC = "inventory.products.events";

    @Autowired
    private ProductSnapshotExporter exporter;

    @Autowired
    private OutboxPublisher publisher;

    @TempDir
    Path directory;

    @Test
    void exportDrainsTheOutboxAndMatchesTheCatalog() throws Exception {
        String laptop = create("SNAP-LAP", "Laptop", 10);
        String mouse = create("SNAP-MOU", "Mouse", 5);
        update(laptop, 1, "SNAP-LAP", "Laptop Pro", 8, true, "Conteo");
        update(mouse, 1, "SNAP-MOU", "Mouse", 5, false, null);

        Path file = directory.resolve("productos.json");
        ProductSnapshotExporter.Report report = exporter.export(file);

        assertThat(report.products()).isEqualTo(2);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM outbox_events WHERE status <> 'PUBLISHED'")
                .query(Long.class).single()).isZero();
        JsonNode snapshot = jsonMapper.readTree(Files.readString(file));
        assertThat(snapshot.get("domain").stringValue()).isEqualTo("product");
        assertThat(snapshot.get("watermarks").size()).isEqualTo(3);

        JsonNode first = item(snapshot, laptop);
        assertThat(first.get("sku").stringValue()).isEqualTo("SNAP-LAP");
        assertThat(first.get("name").stringValue()).isEqualTo("Laptop Pro");
        assertThat(first.get("stockOnHand").longValue()).isEqualTo(8);
        assertThat(first.get("entityVersion").longValue()).isEqualTo(2);
        assertThat(first.get("createdBy").stringValue()).isEqualTo(Tokens.MANAGER_ID.toString());
        assertThat(first.get("sourceEventId").stringValue()).isEqualTo(
                jdbc.sql("SELECT BIN_TO_UUID(event_id) FROM outbox_events WHERE aggregate_id = UUID_TO_BIN(:id) AND entity_version = 2")
                        .param("id", laptop).query(String.class).single());
        assertThat(item(snapshot, mouse).get("active").booleanValue()).isFalse();
        // Mismos campos que lee import_projection_snapshot de Purchases.
        assertThat(names(first)).containsExactlyInAnyOrder("productId", "sku", "name", "unit", "stockOnHand",
                "active", "createdBy", "updatedBy", "entityVersion", "sourceEventId", "sourceEventAt");
    }

    @Test
    void snapshotPlusLaterEventsRebuildsTheCurrentState() throws Exception {
        String laptop = create("REB-LAP", "Laptop", 10);
        String mouse = create("REB-MOU", "Mouse", 5);
        Path file = directory.resolve("productos.json");
        exporter.export(file);
        JsonNode snapshot = jsonMapper.readTree(Files.readString(file));

        // Cambios posteriores al snapshot: quedan después del watermark.
        update(laptop, 1, "REB-LAP", "Laptop Pro", 3, true, "Venta");
        update(mouse, 1, "REB-MOU", "Mouse", 5, false, null);
        String keyboard = create("REB-KEY", "Teclado", 7);
        assertThat(publisher.publishPending()).isEqualTo(3);

        Map<String, Map<String, Object>> rebuilt = new HashMap<>();
        for (JsonNode item : snapshot.get("items")) {
            rebuilt.put(item.get("productId").stringValue(), state(item, item.get("entityVersion").longValue()));
        }
        for (ConsumerRecord<String, String> record : eventsAfter(snapshot.get("watermarks"))) {
            JsonNode event = jsonMapper.readTree(record.value());
            String id = event.get("aggregateId").stringValue();
            long version = event.get("entityVersion").longValue();
            Map<String, Object> current = rebuilt.get(id);
            if (current == null || version > (long) current.get("version")) {
                rebuilt.put(id, state(event.get("data"), version));
            }
        }

        for (String id : List.of(laptop, mouse, keyboard)) {
            assertThat(rebuilt.get(id)).as("producto %s", id).isEqualTo(databaseState(id));
        }
    }

    // --- Utilidades -------------------------------------------------------

    private Map<String, Object> state(JsonNode node, long version) {
        return Map.of("sku", node.get("sku").stringValue(), "name", node.get("name").stringValue(),
                "stock", node.get("stockOnHand").longValue(), "active", node.get("active").booleanValue(),
                "version", version);
    }

    private Map<String, Object> databaseState(String id) {
        return jdbc.sql("SELECT sku, name, stock_on_hand, active, version FROM products WHERE id = UUID_TO_BIN(:id)")
                .param("id", id)
                .query((rs, row) -> Map.<String, Object>of("sku", rs.getString("sku"), "name", rs.getString("name"),
                        "stock", rs.getLong("stock_on_hand"), "active", rs.getBoolean("active"),
                        "version", rs.getLong("version")))
                .single();
    }

    private List<ConsumerRecord<String, String>> eventsAfter(JsonNode watermarks) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KafkaTestcontainer.KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "rebuild-" + UUID.randomUUID(),
                ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false,
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        List<ConsumerRecord<String, String>> records = new java.util.ArrayList<>();
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(config)) {
            List<TopicPartition> partitions = consumer.partitionsFor(TOPIC).stream()
                    .map(info -> new TopicPartition(TOPIC, info.partition())).toList();
            consumer.assign(partitions);
            for (TopicPartition partition : partitions) {
                consumer.seek(partition, watermarks.get(String.valueOf(partition.partition())).longValue() + 1);
            }
            Map<TopicPartition, Long> end = consumer.endOffsets(partitions);
            long deadline = System.currentTimeMillis() + 20_000;
            while (System.currentTimeMillis() < deadline
                    && partitions.stream().anyMatch(p -> consumer.position(p) < end.get(p))) {
                consumer.poll(Duration.ofMillis(300)).forEach(records::add);
            }
        }
        return records;
    }

    private String create(String sku, String name, long stock) throws Exception {
        String body = "{\"sku\":\"" + sku + "\",\"name\":\"" + name + "\",\"stockOnHand\":" + stock + "}";
        String response = mockMvc.perform(post("/api/inventory/products")
                        .header("Authorization", Tokens.bearer(Tokens.manager()))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return jsonMapper.readTree(response).get("data").get("id").stringValue();
    }

    private void update(String id, long version, String sku, String name, long stock, boolean active, String reason)
            throws Exception {
        String body = "{\"expectedVersion\":" + version + ",\"sku\":\"" + sku + "\",\"name\":\"" + name
                + "\",\"stockOnHand\":" + stock + ",\"active\":" + active
                + (reason == null ? "" : ",\"reason\":\"" + reason + "\"") + "}";
        mockMvc.perform(put("/api/inventory/products/" + id)
                        .header("Authorization", Tokens.bearer(Tokens.manager()))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    private static JsonNode item(JsonNode snapshot, String id) {
        for (JsonNode item : snapshot.get("items")) {
            if (id.equals(item.get("productId").stringValue())) {
                return item;
            }
        }
        throw new AssertionError("Producto ausente del snapshot: " + id);
    }

    private static List<String> names(JsonNode node) {
        return node.properties().stream().map(Map.Entry::getKey).toList();
    }
}
