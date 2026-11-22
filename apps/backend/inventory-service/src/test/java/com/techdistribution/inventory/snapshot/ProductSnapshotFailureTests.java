package com.techdistribution.inventory.snapshot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.Tokens;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import org.apache.kafka.common.errors.TimeoutException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Sin Kafka el outbox no se puede drenar: el snapshot no sería consistente y no se escribe. */
class ProductSnapshotFailureTests extends IntegrationTest {

    @MockitoBean
    private KafkaTemplate<String, String> kafka;

    @Autowired
    private ProductSnapshotExporter exporter;

    @TempDir
    Path directory;

    @Test
    void refusesToExportWhileEventsArePending() throws Exception {
        when(kafka.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.failedFuture(new TimeoutException("broker no disponible")));
        mockMvc.perform(post("/api/inventory/products")
                        .header("Authorization", Tokens.bearer(Tokens.manager()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sku\":\"PEND-1\",\"name\":\"Pendiente\",\"stockOnHand\":1}"))
                .andExpect(status().isCreated());

        Path file = directory.resolve("productos.json");
        assertThatThrownBy(() -> exporter.export(file))
                .isInstanceOf(SnapshotException.class)
                .hasMessageContaining("pendientes del outbox");
        assertThat(Files.exists(file)).isFalse();
    }
}
