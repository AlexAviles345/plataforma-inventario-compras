package com.techdistribution.inventory.projection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.KafkaTestcontainer;
import com.techdistribution.inventory.support.UserEvents;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.JsonNode;

/**
 * Consumidor real contra Kafka: aplica eventos, aísla los inválidos en la DLQ y
 * sigue avanzando, reintenta fallos transitorios y no pierde el mensaje si la
 * DLQ falla. Las esperas de reintento se acortan a 100 ms.
 */
@Import(KafkaTestcontainer.class)
@TestPropertySource(properties = {
    "inventory.users-consumer.enabled=true",
    "inventory.users-consumer.retry-delays-ms=100,100,100,100,100",
    "inventory.users-consumer.max-jitter-ms=0"
})
class UserEventsConsumerKafkaTests extends IntegrationTest {

    private static final String TOPIC = "auth.users.events";
    private static final String DLQ = "inventory.auth-users.dlq";

    @Autowired
    private KafkaTemplate<String, String> kafka;

    @MockitoSpyBean
    private UserProjectionIngestor ingestor;

    @MockitoSpyBean
    private UserEventDlqPublisher dlqPublisher;

    @Test
    void projectsUsersPublishedByAuth() throws Exception {
        UUID user = UUID.randomUUID();
        publish(user, UserEvents.event(user, 1, true, UserEvents.INVENTORY_MANAGER));
        publish(user, UserEvents.event(user, 2, false, UserEvents.INVENTORY_MANAGER));

        await(() -> version(user) == 2);
        assertThat(jdbc.sql("SELECT active FROM user_projections WHERE user_id = UUID_TO_BIN(:id)")
                .param("id", user.toString()).query(Boolean.class).single()).isFalse();
    }

    @Test
    void invalidEventGoesStraightToDlqAndThePartitionKeepsMoving() throws Exception {
        UUID user = UUID.randomUUID();
        kafka.send(TOPIC, user.toString(), "{esto no es json").get(10, TimeUnit.SECONDS);
        publish(user, UserEvents.event(user, 1, true, UserEvents.INVENTORY_MANAGER));

        await(() -> version(user) == 1);
        JsonNode dead = dlqMessageFor(user);
        assertThat(dead.get("consumerGroup").stringValue()).isEqualTo("inventory.auth-users.v1");
        assertThat(dead.get("originalTopic").stringValue()).isEqualTo(TOPIC);
        assertThat(dead.get("rawPayload").stringValue()).isEqualTo("{esto no es json");
        assertThat(dead.get("errorType").stringValue()).isEqualTo("PermanentEventException");
        assertThat(dead.get("attemptCount").intValue()).isEqualTo(1);
        assertThat(dead.get("offset").isIntegralNumber()).isTrue();
        assertThat(dead.get("failedAt").stringValue()).endsWith("Z");
    }

    @Test
    void transientFailuresAreRetriedUntilTheyRecover() throws Exception {
        UUID user = UUID.randomUUID();
        AtomicInteger calls = new AtomicInteger();
        doAnswer(invocation -> {
            if (calls.incrementAndGet() <= 2) {
                throw new DataAccessResourceFailureException("MySQL no disponible");
            }
            return invocation.callRealMethod();
        }).when(ingestor).ingest(argThat(event -> event.userId().equals(user)), any(), any());

        publish(user, UserEvents.event(user, 1, true, UserEvents.INVENTORY_MANAGER));

        await(() -> version(user) == 1);
        assertThat(calls.get()).isEqualTo(3);
    }

    @Test
    void exhaustedRetriesEndInDlqWithTheAttemptCount() throws Exception {
        UUID failing = UUID.randomUUID();
        doThrow(new DataAccessResourceFailureException("password=abc MySQL no disponible"))
                .when(ingestor).ingest(argThat(event -> event.userId().equals(failing)), any(), any());

        int partition = publish(failing, UserEvents.event(failing, 1, true, UserEvents.INVENTORY_MANAGER));
        // Un evento posterior en la misma partición demuestra que el offset avanzó.
        UUID next = UUID.randomUUID();
        publishTo(partition, next, UserEvents.event(next, 1, true, UserEvents.INVENTORY_MANAGER));

        await(() -> version(next) == 1);
        JsonNode dead = dlqMessageFor(failing);
        assertThat(dead.get("attemptCount").intValue()).isEqualTo(6);
        assertThat(dead.get("errorType").stringValue()).isEqualTo("DataAccessResourceFailureException");
        assertThat(dead.get("errorMessage").stringValue()).doesNotContain("abc").contains("[REDACTED]");
        assertThat(version(failing)).isZero();
    }

    @Test
    void ifTheDlqFailsTheMessageIsNotCommittedAndIsRetried() throws Exception {
        UUID user = UUID.randomUUID();
        AtomicInteger dlqCalls = new AtomicInteger();
        doAnswer(invocation -> {
            if (dlqCalls.incrementAndGet() == 1) {
                throw new IllegalStateException("DLQ no disponible");
            }
            return invocation.callRealMethod();
        }).when(dlqPublisher).accept(argThat(record -> user.toString().equals(record.key())), any());

        kafka.send(TOPIC, user.toString(), "{roto").get(10, TimeUnit.SECONDS);

        JsonNode dead = dlqMessageFor(user);
        assertThat(dead.get("rawPayload").stringValue()).isEqualTo("{roto");
        assertThat(dlqCalls.get()).isGreaterThanOrEqualTo(2);
    }

    // --- Utilidades -------------------------------------------------------

    /** Publica con key = aggregateId y devuelve la partición asignada. */
    private int publish(UUID key, Map<String, Object> event) throws Exception {
        return kafka.send(TOPIC, key.toString(), jsonMapper.writeValueAsString(event))
                .get(10, TimeUnit.SECONDS).getRecordMetadata().partition();
    }

    private void publishTo(int partition, UUID key, Map<String, Object> event) throws Exception {
        kafka.send(TOPIC, partition, key.toString(), jsonMapper.writeValueAsString(event)).get(10, TimeUnit.SECONDS);
    }

    private long version(UUID user) {
        return jdbc.sql("SELECT COALESCE(MAX(entity_version), 0) FROM user_projections WHERE user_id = UUID_TO_BIN(:id)")
                .param("id", user.toString()).query(Long.class).single();
    }

    private JsonNode dlqMessageFor(UUID key) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KafkaTestcontainer.KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "dlq-reader-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        List<JsonNode> found = new ArrayList<>();
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of(DLQ));
            long deadline = System.currentTimeMillis() + 30_000;
            while (found.isEmpty() && System.currentTimeMillis() < deadline) {
                consumer.poll(Duration.ofMillis(500)).forEach(record -> {
                    if (key.toString().equals(record.key())) {
                        found.add(jsonMapper.readTree(record.value()));
                    }
                });
            }
        }
        assertThat(found).as("mensaje en la DLQ para la key %s", key).isNotEmpty();
        return found.get(0);
    }

    private static void await(BooleanSupplier condition) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 30_000;
        while (!condition.getAsBoolean()) {
            assertThat(System.currentTimeMillis()).as("condición no cumplida en 30 s").isLessThan(deadline);
            Thread.sleep(200);
        }
    }
}
