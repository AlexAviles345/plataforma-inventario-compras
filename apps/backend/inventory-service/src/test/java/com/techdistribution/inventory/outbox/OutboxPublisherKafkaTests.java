package com.techdistribution.inventory.outbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.KafkaTestcontainer;
import com.techdistribution.inventory.support.Tokens;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

/** Publicación real contra Kafka: orden por producto, key = aggregateId y estado PUBLISHED. */
@Import(KafkaTestcontainer.class)
class OutboxPublisherKafkaTests extends IntegrationTest {

    private static final String TOPIC = "inventory.products.events";

    @Autowired
    private OutboxPublisher publisher;

    @Test
    void publishesEveryVersionInOrderWithTheAggregateAsKey() throws Exception {
        String id = createProduct();
        for (int version = 1; version <= 3; version++) {
            mockMvc.perform(put("/api/inventory/products/" + id)
                            .header("Authorization", Tokens.bearer(Tokens.manager()))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"expectedVersion\":" + version + ",\"sku\":\"KAF-1\",\"name\":\"Kafka "
                                    + version + "\",\"stockOnHand\":1,\"active\":true}"))
                    .andExpect(status().isOk());
        }

        assertThat(publisher.publishPending()).isEqualTo(4);
        assertThat(publisher.publishPending()).isZero();
        assertThat(jdbc.sql("SELECT COUNT(*) FROM outbox_events WHERE status = 'PUBLISHED' AND published_at IS NOT NULL")
                .query(Long.class).single()).isEqualTo(4);

        List<ConsumerRecord<String, String>> records = consume(4);
        assertThat(records).extracting(ConsumerRecord::key).containsOnly(id);
        List<Long> versions = new ArrayList<>();
        for (ConsumerRecord<String, String> record : records) {
            JsonNode event = jsonMapper.readTree(record.value());
            assertThat(event.get("aggregateId").stringValue()).isEqualTo(id);
            versions.add(event.get("entityVersion").longValue());
        }
        assertThat(versions).containsExactly(1L, 2L, 3L, 4L);
        assertThat(jsonMapper.readTree(records.get(0).value()).get("eventType").stringValue())
                .isEqualTo("ProductCreated");
        assertThat(jsonMapper.readTree(records.get(3).value()).get("data").get("name").stringValue())
                .isEqualTo("Kafka 3");
    }

    private String createProduct() throws Exception {
        String response = mockMvc.perform(post("/api/inventory/products")
                        .header("Authorization", Tokens.bearer(Tokens.manager()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sku\":\"KAF-1\",\"name\":\"Kafka\",\"stockOnHand\":1}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return jsonMapper.readTree(response).get("data").get("id").stringValue();
    }

    private List<ConsumerRecord<String, String>> consume(int expected) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KafkaTestcontainer.KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "inventory-test-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        List<ConsumerRecord<String, String>> records = new ArrayList<>();
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of(TOPIC));
            long deadline = System.currentTimeMillis() + 30_000;
            while (records.size() < expected && System.currentTimeMillis() < deadline) {
                consumer.poll(Duration.ofMillis(500)).forEach(records::add);
            }
        }
        return records;
    }
}
