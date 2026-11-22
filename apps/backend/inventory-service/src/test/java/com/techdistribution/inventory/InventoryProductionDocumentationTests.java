package com.techdistribution.inventory;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = "DOCS_ENABLED=false")
class InventoryProductionDocumentationTests extends IntegrationTest {

    @Test
    void disablesDocumentationWhenConfiguredForProduction() throws Exception {
        mockMvc.perform(get("/docs"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/inventory/openapi.json"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/health/live"))
                .andExpect(status().isOk());
    }
}
