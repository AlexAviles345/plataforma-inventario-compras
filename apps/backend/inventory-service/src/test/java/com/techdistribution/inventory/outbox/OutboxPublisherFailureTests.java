package com.techdistribution.inventory.outbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.Tokens;
import java.util.concurrent.CompletableFuture;
import org.apache.kafka.common.errors.TimeoutException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Kafka no disponible: la API sigue respondiendo, la fila vuelve a PENDING con
 * backoff y la versión siguiente del mismo producto no se adelanta.
 */
class OutboxPublisherFailureTests extends IntegrationTest {

    @MockitoBean
    private KafkaTemplate<String, String> kafka;

    @Autowired
    private OutboxPublisher publisher;

    @Test
    void keepsEventsPendingAndOrderedWhileKafkaIsDown() throws Exception {
        when(kafka.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.failedFuture(new TimeoutException("broker no disponible")));

        String id = createProduct();
        mockMvc.perform(put("/api/inventory/products/" + id)
                        .header("Authorization", Tokens.bearer(Tokens.manager()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":1,\"sku\":\"OUT-1\",\"name\":\"Otro\",\"stockOnHand\":1,"
                                + "\"active\":true}"))
                .andExpect(status().isOk());

        assertThat(publisher.publishPending()).isZero();

        assertThat(jdbc.sql("""
                SELECT CONCAT_WS('|', entity_version, status, attempt_count, last_error IS NOT NULL,
                                 next_attempt_at > UTC_TIMESTAMP(6), locked_by IS NULL)
                FROM outbox_events ORDER BY entity_version
                """).query(String.class).list())
                .containsExactly("1|PENDING|1|1|1|1", "2|PENDING|0|0|0|1");
        // Solo se intentó la versión 1: la 2 espera a que la anterior se publique.
        verify(kafka).send(anyString(), anyString(), anyString());

        // Al volver Kafka y vencer el backoff, se publican en orden.
        when(kafka.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.<SendResult<String, String>>completedFuture(null));
        jdbc.sql("UPDATE outbox_events SET next_attempt_at = UTC_TIMESTAMP(6) - INTERVAL 1 SECOND").update();
        assertThat(publisher.publishPending()).isEqualTo(2);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM outbox_events WHERE status = 'PUBLISHED'")
                .query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void doesNothingWithoutPendingEvents() {
        assertThat(publisher.publishPending()).isZero();
        verify(kafka, never()).send(anyString(), anyString(), anyString());
    }

    private String createProduct() throws Exception {
        String response = mockMvc.perform(post("/api/inventory/products")
                        .header("Authorization", Tokens.bearer(Tokens.manager()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sku\":\"OUT-1\",\"name\":\"Outbox\",\"stockOnHand\":1}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return jsonMapper.readTree(response).get("data").get("id").stringValue();
    }
}
