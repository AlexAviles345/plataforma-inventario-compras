package com.techdistribution.inventory.snapshot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.techdistribution.inventory.projection.UserEvent;
import com.techdistribution.inventory.projection.UserEventValidator;
import com.techdistribution.inventory.projection.UserProjectionIngestor;
import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.KafkaTestcontainer;
import com.techdistribution.inventory.support.UserEvents;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/** Importación de snapshot de usuarios y reconstrucción después de la retención de Kafka. */
@Import(KafkaTestcontainer.class)
@TestPropertySource(properties = "inventory.users-consumer.group-id=" + UserSnapshotKafkaTests.GROUP)
class UserSnapshotKafkaTests extends IntegrationTest {

    static final String GROUP = "inventory.auth-users.snapshot-test";
    private static final AtomicLong OFFSETS = new AtomicLong(1_000);

    @Autowired
    private UserSnapshotImporter importer;

    @Autowired
    private UserEventValidator validator;

    @Autowired
    private UserProjectionIngestor ingestor;

    @TempDir
    Path directory;

    @Test
    void importsOnlyNewerVersionsAndIsRepeatable() throws Exception {
        UUID ana = UUID.randomUUID();
        UUID beto = UUID.randomUUID();
        apply(UserEvents.event(beto, 5, true, UserEvents.INVENTORY_MANAGER));
        Path file = write(List.of(item(ana, 2, true), item(beto, 3, false)), null);

        UserSnapshotImporter.Report first = importer.importFile(file, true);
        assertThat(first.applied()).isEqualTo(1);
        assertThat(first.skippedStale()).isEqualTo(1);
        assertThat(projection(ana)).isEqualTo("2|1");
        assertThat(projection(beto)).isEqualTo("5|1");

        UserSnapshotImporter.Report again = importer.importFile(file, true);
        assertThat(again.applied()).isZero();
        assertThat(again.skippedStale()).isEqualTo(2);
    }

    @Test
    void anInvalidItemRejectsTheWholeFile() throws Exception {
        UUID valid = UUID.randomUUID();
        Map<String, Object> broken = item(UUID.randomUUID(), 1, true);
        broken.put("assignments", List.of(Map.of("system", "INVENTORY", "role", "PURCHASES_AGENT")));
        Path file = write(List.of(item(valid, 1, true), broken), null);

        assertThatThrownBy(() -> importer.importFile(file, true))
                .isInstanceOf(SnapshotException.class)
                .hasMessageContaining("items[1]")
                .hasMessageContaining("No se importó nada");
        assertThat(projection(valid)).isNull();
    }

    @Test
    void reportsMissingFilesAndMalformedWatermarks() throws Exception {
        assertThatThrownBy(() -> importer.importFile(directory.resolve("no-existe.json"), true))
                .isInstanceOf(SnapshotException.class).hasMessageContaining("no existe");
        Path file = write(List.of(), Map.of("x", 1));
        assertThatThrownBy(() -> importer.importFile(file, true))
                .isInstanceOf(SnapshotException.class).hasMessageContaining("Partición inválida");
    }

    @Test
    void positionsTheConsumerGroupRightAfterTheWatermarks() throws Exception {
        Path file = write(List.of(item(UUID.randomUUID(), 1, true)), Map.of("0", 4, "1", -1, "2", 7));

        UserSnapshotImporter.Report report = importer.importFile(file, true);

        assertThat(report.offsetsMoved()).isTrue();
        Map<TopicPartition, OffsetAndMetadata> committed;
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG,
                KafkaTestcontainer.KAFKA.getBootstrapServers()))) {
            committed = admin.listConsumerGroupOffsets(GROUP).partitionsToOffsetAndMetadata().get();
        }
        assertThat(committed.get(new TopicPartition("auth.users.events", 0)).offset()).isEqualTo(5);
        assertThat(committed.get(new TopicPartition("auth.users.events", 1)).offset()).isZero();
        assertThat(committed.get(new TopicPartition("auth.users.events", 2)).offset()).isEqualTo(8);
    }

    /**
     * Criterio de aceptación: reconstruir desde un snapshot intermedio y reproducir
     * los eventos posteriores (con duplicados y desorden) da el mismo estado final
     * que haber consumido todo el historial.
     */
    @Test
    void snapshotPlusReplayReachesTheSameFinalState() throws Exception {
        List<UUID> users = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        List<Map<String, Object>> history = new ArrayList<>();
        Random random = new Random(42);
        for (long version = 1; version <= 6; version++) {
            for (UUID user : users) {
                history.add(UserEvents.event(user, version, random.nextBoolean(),
                        random.nextBoolean() ? UserEvents.INVENTORY_MANAGER : UserEvents.PURCHASES_AGENT));
            }
        }

        history.forEach(this::apply);
        Map<UUID, String> expected = snapshotOfProjections(users);

        // Se "pierde" Kafka: se vacía la proyección y se reconstruye.
        jdbc.sql("DELETE FROM user_projections").update();
        jdbc.sql("DELETE FROM inbox_events").update();
        int cut = 8;
        Map<UUID, Map<String, Object>> snapshotItems = new LinkedHashMap<>();
        for (Map<String, Object> event : history.subList(0, cut)) {
            Map<String, Object> data = UserEvents.data(event);
            Map<String, Object> item = new LinkedHashMap<>(data);
            item.put("entityVersion", event.get("entityVersion"));
            item.put("sourceEventId", event.get("eventId"));
            item.put("sourceEventAt", event.get("timestamp"));
            snapshotItems.put(UUID.fromString((String) data.get("userId")), item);
        }
        importer.importFile(write(new ArrayList<>(snapshotItems.values()), null), false);

        List<Map<String, Object>> replay = new ArrayList<>(history.subList(cut - 3, history.size()));
        replay.addAll(history.subList(cut, cut + 4));
        Collections.shuffle(replay, random);
        replay.forEach(this::apply);

        assertThat(snapshotOfProjections(users)).isEqualTo(expected);
    }

    // --- Utilidades -------------------------------------------------------

    private void apply(Map<String, Object> event) {
        String raw = jsonMapper.writeValueAsString(event);
        UserEvent parsed = validator.validate(raw, event.get("aggregateId").toString());
        ingestor.ingest(parsed, raw,
                new UserProjectionIngestor.Position(GROUP, "auth.users.events", 0, OFFSETS.incrementAndGet()));
    }

    private static Map<String, Object> item(UUID userId, long version, boolean active) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("userId", userId.toString());
        item.put("email", "snapshot" + version + "@techdistribution.test");
        item.put("displayName", "Snapshot v" + version);
        item.put("active", active);
        item.put("assignments", UserEvents.INVENTORY_MANAGER);
        item.put("entityVersion", version);
        return item;
    }

    private Path write(List<Map<String, Object>> items, Map<String, Object> watermarks) throws Exception {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("items", items);
        if (watermarks != null) {
            snapshot.put("watermarks", watermarks);
        }
        Path file = Files.createTempFile(directory, "usuarios", ".json");
        Files.writeString(file, jsonMapper.writeValueAsString(snapshot));
        return file;
    }

    private String projection(UUID userId) {
        return jdbc.sql("SELECT CONCAT_WS('|', entity_version, active) FROM user_projections WHERE user_id = UUID_TO_BIN(:id)")
                .param("id", userId.toString()).query(String.class).optional().orElse(null);
    }

    private Map<UUID, String> snapshotOfProjections(List<UUID> users) {
        Map<UUID, String> state = new LinkedHashMap<>();
        for (UUID user : users) {
            state.put(user, jdbc.sql("""
                    SELECT CONCAT_WS('|', entity_version, active, email, display_name, CAST(assignments AS CHAR))
                    FROM user_projections WHERE user_id = UUID_TO_BIN(:id)
                    """).param("id", user.toString()).query(String.class).single());
        }
        return state;
    }
}
