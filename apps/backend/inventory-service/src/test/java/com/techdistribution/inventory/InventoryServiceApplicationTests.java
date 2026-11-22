package com.techdistribution.inventory;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.Tokens;
import org.junit.jupiter.api.Test;

class InventoryServiceApplicationTests extends IntegrationTest {

    @Test
    void contextLoads() {
    }

    @Test
    void exposesHealthEndpoints() throws Exception {
        mockMvc.perform(get("/health/live"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.service").value("inventory-service"));

        mockMvc.perform(get("/health/ready"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ready"));
    }

    @Test
    void exposesOpenApiAndSwaggerInDevelopment() throws Exception {
        mockMvc.perform(get("/api/inventory/openapi.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title").value("TechDistribution Inventory Service"))
                .andExpect(jsonPath("$.paths['/api/inventory/products'].get").exists())
                .andExpect(jsonPath("$.paths['/api/inventory/products'].post").exists())
                .andExpect(jsonPath("$.paths['/api/inventory/products/stats'].get").exists())
                .andExpect(jsonPath("$.paths['/api/inventory/products/{id}'].put").exists())
                .andExpect(jsonPath("$.paths['/api/inventory/products'].get.parameters[?(@.name == 'actor')]")
                        .isEmpty());

        mockMvc.perform(get("/docs"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/swagger-ui/index.html"));
    }

    @Test
    void unknownRoutesReturnTheErrorContract() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/inventory").header("Authorization", Tokens.bearer(Tokens.manager())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
                .andExpect(jsonPath("$.source").value("inventory"));
    }
}
