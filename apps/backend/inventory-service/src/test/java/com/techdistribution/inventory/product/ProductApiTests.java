package com.techdistribution.inventory.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.Tokens;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

class ProductApiTests extends IntegrationTest {

    private static final String PRODUCTS = "/api/inventory/products";
    private static final Path CONTRACTS = Path.of("..", "..", "..", "contracts", "events");

    // --- Alta -------------------------------------------------------------

    @Test
    void createsProductWithInitialStockAdjustmentAndOutboxEvent() throws Exception {
        String requestId = UUID.randomUUID().toString();
        JsonNode created = body(perform(post(PRODUCTS).header("X-Request-Id", requestId),
                        "{\"sku\":\" lap-001 \",\"name\":\" Laptop 14 \",\"unit\":\"UNIT\",\"stockOnHand\":25}")
                .andExpect(status().isCreated())
                .andExpect(header().string("X-Request-Id", requestId))
                .andExpect(jsonPath("$.error").value(false))
                .andExpect(jsonPath("$.statusCode").value(201))
                .andExpect(jsonPath("$.meta").doesNotExist())
                .andExpect(jsonPath("$.data.sku").value("LAP-001"))
                .andExpect(jsonPath("$.data.name").value("Laptop 14"))
                .andExpect(jsonPath("$.data.unit").value("UNIT"))
                .andExpect(jsonPath("$.data.stockOnHand").value(25))
                .andExpect(jsonPath("$.data.active").value(true))
                .andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.createdBy").value(Tokens.MANAGER_ID.toString()))
                .andExpect(jsonPath("$.data.updatedBy").value(Tokens.MANAGER_ID.toString())));
        UUID id = UUID.fromString(created.get("data").get("id").stringValue());

        assertThat(adjustments(id)).containsExactly("INITIAL|1|0|25|25");
        JsonNode event = singleEvent(id, 1);
        assertThat(event.get("eventType").stringValue()).isEqualTo("ProductCreated");
        assertThat(event.get("correlationId").stringValue()).isEqualTo(requestId);
        assertThat(event.get("data").get("stockOnHand").longValue()).isEqualTo(25);
    }

    @Test
    void unitIsOptionalOnCreate() throws Exception {
        create("MOU-1", "Mouse", 3);
    }

    @Test
    void rejectsDuplicateSkuIgnoringCase() throws Exception {
        create("LAP-001", "Laptop", 1);
        perform(post(PRODUCTS), "{\"sku\":\"lap-001\",\"name\":\"Otra\",\"stockOnHand\":1}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SKU_ALREADY_EXISTS"));
    }

    @Test
    void reportsEveryInvalidFieldOnCreate() throws Exception {
        perform(post(PRODUCTS), "{\"sku\":\"mal sku\",\"name\":\"   \",\"unit\":\"BOX\",\"stockOnHand\":1.5,\"x\":1}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.details[?(@.field == 'sku')].code").value("INVALID_FORMAT"))
                .andExpect(jsonPath("$.details[?(@.field == 'name')].code").value("REQUIRED"))
                .andExpect(jsonPath("$.details[?(@.field == 'unit')].code").value("INVALID_UNIT"))
                .andExpect(jsonPath("$.details[?(@.field == 'stockOnHand')].code").value("INVALID_TYPE"))
                .andExpect(jsonPath("$.details[?(@.field == 'x')].code").value("UNKNOWN_FIELD"));
        assertThat(count("products")).isZero();
    }

    @Test
    void rejectsCoercedAndNegativeNumbers() throws Exception {
        perform(post(PRODUCTS), "{\"sku\":\"A1\",\"name\":\"A\",\"stockOnHand\":\"5\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("INVALID_TYPE"));
        perform(post(PRODUCTS), "{\"sku\":\"A1\",\"name\":\"A\",\"stockOnHand\":-1}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("OUT_OF_RANGE"));
    }

    @Test
    void rejectsMalformedJsonAndNonObjectBodies() throws Exception {
        perform(post(PRODUCTS), "{\"sku\":")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        perform(post(PRODUCTS), "[]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("INVALID_BODY"));
    }

    // --- Edición ----------------------------------------------------------

    @Test
    void correctsStockWithReasonAndAuditsIt() throws Exception {
        UUID id = create("LAP-001", "Laptop", 25);
        perform(put(PRODUCTS + "/" + id),
                        update(1, "LAP-001", "Laptop", 20, true, "\"  Conteo físico\\n mensual \""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stockOnHand").value(20))
                .andExpect(jsonPath("$.data.version").value(2));

        assertThat(adjustments(id)).containsExactly("INITIAL|1|0|25|25", "CORRECTION|2|25|20|-5");
        assertThat(jdbc.sql("SELECT reason FROM stock_adjustments WHERE adjustment_type = 'CORRECTION'")
                .query(String.class).single()).isEqualTo("Conteo físico  mensual");
        assertThat(singleEvent(id, 2).get("eventType").stringValue()).isEqualTo("ProductUpdated");
    }

    @Test
    void requiresReasonWhenStockChanges() throws Exception {
        UUID id = create("LAP-001", "Laptop", 25);
        perform(put(PRODUCTS + "/" + id), update(1, "LAP-001", "Laptop", 20, true, null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("reason"))
                .andExpect(jsonPath("$.details[0].code").value("REQUIRED"));
        perform(put(PRODUCTS + "/" + id), update(1, "LAP-001", "Laptop", 20, true, "\"   \""))
                .andExpect(status().isBadRequest());
    }

    @Test
    void renamesAndDeactivatesWithoutStockAdjustment() throws Exception {
        UUID id = create("LAP-001", "Laptop", 25);
        perform(put(PRODUCTS + "/" + id), update(1, "lap-002", "Laptop Pro", 25, false, null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sku").value("LAP-002"))
                .andExpect(jsonPath("$.data.active").value(false))
                .andExpect(jsonPath("$.data.version").value(2));

        assertThat(adjustments(id)).containsExactly("INITIAL|1|0|25|25");
        JsonNode event = singleEvent(id, 2);
        assertThat(event.get("data").get("active").booleanValue()).isFalse();
        assertThat(event.get("data").get("sku").stringValue()).isEqualTo("LAP-002");
    }

    @Test
    void identicalUpdateIsANoOp() throws Exception {
        UUID id = create("LAP-001", "Laptop", 25);
        perform(put(PRODUCTS + "/" + id), update(1, "LAP-001", "Laptop", 25, true, "\"sin cambios\""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(1));
        assertThat(count("outbox_events")).isEqualTo(1);
    }

    @Test
    void rejectsStaleExpectedVersion() throws Exception {
        UUID id = create("LAP-001", "Laptop", 25);
        perform(put(PRODUCTS + "/" + id), update(1, "LAP-001", "Laptop A", 25, true, null))
                .andExpect(status().isOk());
        perform(put(PRODUCTS + "/" + id), update(1, "LAP-001", "Laptop B", 25, true, null))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    @Test
    void concurrentUpdatesWithTheSameVersionLetOnlyOneWin() throws Exception {
        UUID id = create("LAP-001", "Laptop", 25);
        int writers = 6;
        List<Callable<Integer>> tasks = new ArrayList<>();
        for (int i = 0; i < writers; i++) {
            String body = update(1, "LAP-001", "Laptop " + i, 10 + i, true, "\"Ajuste " + i + "\"");
            tasks.add(() -> perform(put(PRODUCTS + "/" + id), body).andReturn().getResponse().getStatus());
        }
        ExecutorService pool = Executors.newFixedThreadPool(writers);
        List<Integer> statuses = new ArrayList<>();
        try {
            for (Future<Integer> result : pool.invokeAll(tasks)) {
                statuses.add(result.get());
            }
        } finally {
            pool.shutdown();
        }
        assertThat(statuses).containsOnlyOnce(200).containsOnly(200, 409);
        assertThat(jdbc.sql("SELECT version FROM products").query(Long.class).single()).isEqualTo(2);
        assertThat(adjustments(id)).hasSize(2);
        assertThat(count("outbox_events")).isEqualTo(2);
    }

    @Test
    void rejectsSkuOfAnotherProduct() throws Exception {
        create("LAP-001", "Laptop", 1);
        UUID other = create("MOU-001", "Mouse", 1);
        perform(put(PRODUCTS + "/" + other), update(1, "lap-001", "Mouse", 1, true, null))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SKU_ALREADY_EXISTS"));
    }

    @Test
    void handlesUnknownAndMalformedIds() throws Exception {
        perform(put(PRODUCTS + "/" + UUID.randomUUID()), update(1, "A", "A", 1, true, null))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        perform(put(PRODUCTS + "/no-es-uuid"), update(1, "A", "A", 1, true, null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("INVALID_UUID"));
        mockMvc.perform(authorized(get(PRODUCTS + "/" + UUID.randomUUID())))
                .andExpect(status().isNotFound());
    }

    // --- Consultas --------------------------------------------------------

    @Test
    void listsWithPaginationSearchAndActiveFilter() throws Exception {
        create("LAP-001", "Laptop", 5);
        create("LAP-002", "Laptop Pro", 0);
        create("MOU-001", "Mouse", 3);
        UUID keyboard = create("KEY_1", "Teclado", 2);
        perform(put(PRODUCTS + "/" + keyboard), update(1, "KEY_1", "Teclado", 2, false, null))
                .andExpect(status().isOk());

        mockMvc.perform(authorized(get(PRODUCTS).param("page", "1").param("limit", "2")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].name").value("Laptop"))
                .andExpect(jsonPath("$.meta.page").value(1))
                .andExpect(jsonPath("$.meta.limit").value(2))
                .andExpect(jsonPath("$.meta.total").value(4))
                .andExpect(jsonPath("$.meta.totalPages").value(2));
        mockMvc.perform(authorized(get(PRODUCTS).param("search", "lap")))
                .andExpect(jsonPath("$.meta.total").value(2));
        mockMvc.perform(authorized(get(PRODUCTS).param("active", "false")))
                .andExpect(jsonPath("$.data[0].sku").value("KEY_1"))
                .andExpect(jsonPath("$.meta.total").value(1));
        // "_" se busca literalmente, no como comodín de LIKE.
        mockMvc.perform(authorized(get(PRODUCTS).param("search", "_")))
                .andExpect(jsonPath("$.meta.total").value(1));
        mockMvc.perform(authorized(get(PRODUCTS).param("page", "9")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
    }

    @Test
    void emptyCatalogHasZeroPages() throws Exception {
        mockMvc.perform(authorized(get(PRODUCTS)))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.meta.total").value(0))
                .andExpect(jsonPath("$.meta.totalPages").value(0))
                .andExpect(jsonPath("$.meta.limit").value(20));
    }

    @Test
    void rejectsInvalidPaginationParameters() throws Exception {
        for (String[] param : new String[][] {{"page", "0"}, {"limit", "101"}, {"limit", "x"}, {"active", "si"}}) {
            mockMvc.perform(authorized(get(PRODUCTS).param(param[0], param[1])))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                    .andExpect(jsonPath("$.details[0].field").value(param[0]));
        }
    }

    @Test
    void computesStats() throws Exception {
        mockMvc.perform(authorized(get(PRODUCTS + "/stats")))
                .andExpect(jsonPath("$.data.totalProducts").value(0))
                .andExpect(jsonPath("$.data.totalUnitsOnHand").value(0))
                .andExpect(jsonPath("$.data.lowStockProducts").isEmpty())
                .andExpect(jsonPath("$.data.topStockProducts").isEmpty());

        create("A1", "A", 10);
        create("A2", "B", 0);
        UUID inactive = create("A3", "C", 5);
        perform(put(PRODUCTS + "/" + inactive), update(1, "A3", "C", 5, false, null)).andExpect(status().isOk());

        mockMvc.perform(authorized(get(PRODUCTS + "/stats")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Estadísticas de inventario obtenidas exitosamente"))
                .andExpect(jsonPath("$.data.totalProducts").value(3))
                .andExpect(jsonPath("$.data.activeProducts").value(2))
                .andExpect(jsonPath("$.data.inactiveProducts").value(1))
                .andExpect(jsonPath("$.data.outOfStockProducts").value(1))
                .andExpect(jsonPath("$.data.totalUnitsOnHand").value(15))
                .andExpect(jsonPath("$.data.lowStockProducts.length()").value(2))
                .andExpect(jsonPath("$.data.lowStockProducts[0].sku").value("A2"))
                .andExpect(jsonPath("$.data.topStockProducts.length()").value(2))
                .andExpect(jsonPath("$.data.topStockProducts[0].sku").value("A1"));
    }

    // --- Contrato del evento ----------------------------------------------

    @Test
    void outboxPayloadMatchesTheSharedProductEventContract() throws Exception {
        UUID id = create("LAP-001", "Laptop", 25);
        JsonNode event = singleEvent(id, 1);
        JsonNode envelopeSchema = jsonMapper.readTree(Files.readString(CONTRACTS.resolve("event-envelope.schema.json")));
        JsonNode productSchema = jsonMapper.readTree(Files.readString(CONTRACTS.resolve("product-event.schema.json")));

        assertThat(names(event)).isEqualTo(names(envelopeSchema.get("properties")));
        JsonNode dataSchema = productSchema.get("allOf").get(1).get("properties").get("data");
        assertThat(names(event.get("data"))).isEqualTo(names(dataSchema.get("properties")));
        assertThat(event.get("schemaVersion").intValue()).isEqualTo(1);
        assertThat(event.get("aggregateId").stringValue()).isEqualTo(id.toString());
        assertThat(event.get("data").get("productId").stringValue()).isEqualTo(id.toString());
        assertThat(event.get("timestamp").stringValue())
                .matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$");
        assertThat(jdbc.sql("SELECT partition_key FROM outbox_events").query(String.class).single())
                .isEqualTo(id.toString());
    }

    // --- Utilidades -------------------------------------------------------

    private UUID create(String sku, String name, long stock) throws Exception {
        String body = "{\"sku\":\"" + sku + "\",\"name\":\"" + name + "\",\"stockOnHand\":" + stock + "}";
        JsonNode created = body(perform(post(PRODUCTS), body).andExpect(status().isCreated()));
        return UUID.fromString(created.get("data").get("id").stringValue());
    }

    private static String update(long version, String sku, String name, long stock, boolean active, String reason) {
        return "{\"expectedVersion\":" + version + ",\"sku\":\"" + sku + "\",\"name\":\"" + name
                + "\",\"stockOnHand\":" + stock + ",\"active\":" + active
                + (reason == null ? "" : ",\"reason\":" + reason) + "}";
    }

    private ResultActions perform(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mockMvc.perform(authorized(request).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static MockHttpServletRequestBuilder authorized(MockHttpServletRequestBuilder request) {
        return request.header("Authorization", Tokens.bearer(Tokens.manager()));
    }

    private JsonNode body(ResultActions result) throws Exception {
        return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private List<String> adjustments(UUID productId) {
        return jdbc.sql("""
                SELECT CONCAT_WS('|', adjustment_type, product_version, previous_stock, new_stock, delta)
                FROM stock_adjustments WHERE product_id = UUID_TO_BIN(:id) ORDER BY product_version
                """).param("id", productId.toString()).query(String.class).list();
    }

    private JsonNode singleEvent(UUID productId, long version) {
        String payload = jdbc.sql("""
                SELECT CAST(payload AS CHAR) FROM outbox_events
                WHERE aggregate_id = UUID_TO_BIN(:id) AND entity_version = :version AND status = 'PENDING'
                """).param("id", productId.toString()).param("version", version).query(String.class).single();
        return jsonMapper.readTree(payload);
    }

    private long count(String table) {
        return jdbc.sql("SELECT COUNT(*) FROM " + table).query(Long.class).single();
    }

    private static Set<String> names(JsonNode node) {
        Set<String> names = new HashSet<>();
        for (Map.Entry<String, JsonNode> property : node.properties()) {
            names.add(property.getKey());
        }
        return names;
    }
}
