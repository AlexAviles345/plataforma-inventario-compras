package com.techdistribution.inventory.projection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.projection.UserProjectionIngestor.Outcome;
import com.techdistribution.inventory.projection.UserProjectionIngestor.Position;
import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.Tokens;
import com.techdistribution.inventory.support.UserEvents;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Inbox + proyección atómicas, idempotencia, orden por versión y acceso a la API. */
class UserProjectionTests extends IntegrationTest {

    private static final AtomicLong OFFSETS = new AtomicLong();

    @Autowired
    private UserEventValidator validator;

    @Autowired
    private UserProjectionIngestor ingestor;

    private final UUID userId = UUID.randomUUID();

    // --- Ingesta ----------------------------------------------------------

    @Test
    void appliesNewUsersAndNewerVersions() {
        assertThat(apply(UserEvents.event(userId, 1, true, UserEvents.INVENTORY_MANAGER))).isEqualTo(Outcome.APPLIED);
        assertThat(apply(UserEvents.event(userId, 2, false, UserEvents.INVENTORY_MANAGER))).isEqualTo(Outcome.APPLIED);

        assertThat(projection()).isEqualTo("2|0|usuario2@techdistribution.test");
        assertThat(inbox()).containsExactly("1|APPLIED", "2|APPLIED");
    }

    @Test
    void duplicatedEventIdChangesNothing() {
        Map<String, Object> created = UserEvents.event(userId, 1, true, UserEvents.INVENTORY_MANAGER);
        assertThat(apply(created)).isEqualTo(Outcome.APPLIED);
        assertThat(apply(created)).isEqualTo(Outcome.DUPLICATE);
        assertThat(inbox()).containsExactly("1|APPLIED");
    }

    @Test
    void olderVersionsArriveLateAndAreIgnoredButRecorded() {
        Map<String, Object> v1 = UserEvents.event(userId, 1, true, UserEvents.INVENTORY_MANAGER);
        Map<String, Object> v3 = UserEvents.event(userId, 3, false, UserEvents.INVENTORY_MANAGER);
        Map<String, Object> v2 = UserEvents.event(userId, 2, true, UserEvents.INVENTORY_MANAGER);

        // Llega primero un Updated v3: crea la proyección sin necesitar el Created.
        assertThat(apply(v3)).isEqualTo(Outcome.APPLIED);
        assertThat(apply(v1)).isEqualTo(Outcome.IGNORED_STALE);
        assertThat(apply(v2)).isEqualTo(Outcome.IGNORED_STALE);

        assertThat(projection()).isEqualTo("3|0|usuario3@techdistribution.test");
        assertThat(inbox()).containsExactlyInAnyOrder("3|APPLIED", "1|IGNORED_STALE", "2|IGNORED_STALE");
    }

    @Test
    void storesTheCompleteAssignmentSnapshot() {
        apply(UserEvents.event(userId, 1, true, List.of(
                Map.of("system", "INVENTORY", "role", "ADMIN"), Map.of("system", "PURCHASES", "role", "ADMIN"))));
        String assignments = jdbc.sql("SELECT CAST(assignments AS CHAR) FROM user_projections WHERE user_id = UUID_TO_BIN(:id)")
                .param("id", userId.toString()).query(String.class).single();
        assertThat(jsonMapper.readTree(assignments).size()).isEqualTo(2);
    }

    // --- Acceso a la API --------------------------------------------------

    @Test
    void unknownUserGetsProjectionNotReadyWithRetryAfter() throws Exception {
        jdbc.sql("DELETE FROM user_projections").update();
        mockMvc.perform(authorized(get("/api/inventory/products")))
                .andExpect(status().isConflict())
                .andExpect(header().string("Retry-After", "2"))
                .andExpect(jsonPath("$.code").value("PROJECTION_NOT_READY"))
                .andExpect(jsonPath("$.source").value("inventory"));
    }

    @Test
    void deactivationInAuthBlocksTheUserAsSoonAsTheEventArrives() throws Exception {
        mockMvc.perform(authorized(get("/api/inventory/products"))).andExpect(status().isOk());

        apply(UserEvents.event(Tokens.MANAGER_ID, 2, false, UserEvents.INVENTORY_MANAGER));

        mockMvc.perform(authorized(get("/api/inventory/products")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.message").value("El usuario se encuentra inactivo"));
    }

    @Test
    void userWithoutInventoryAssignmentIsForbidden() throws Exception {
        apply(UserEvents.event(Tokens.MANAGER_ID, 2, true, UserEvents.PURCHASES_AGENT));
        mockMvc.perform(authorized(get("/api/inventory/products/stats")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void openApiStaysPublicWithoutProjection() throws Exception {
        jdbc.sql("DELETE FROM user_projections").update();
        mockMvc.perform(get("/api/inventory/openapi.json")).andExpect(status().isOk());
    }

    // --- Utilidades -------------------------------------------------------

    private Outcome apply(Map<String, Object> event) {
        String raw = jsonMapper.writeValueAsString(event);
        UserEvent parsed = validator.validate(raw, event.get("aggregateId").toString());
        return ingestor.ingest(parsed, raw,
                new Position("inventory.auth-users.v1", "auth.users.events", 0, OFFSETS.incrementAndGet()));
    }

    private String projection() {
        return jdbc.sql("""
                SELECT CONCAT_WS('|', entity_version, active, email) FROM user_projections
                WHERE user_id = UUID_TO_BIN(:id)
                """).param("id", userId.toString()).query(String.class).single();
    }

    private List<String> inbox() {
        return jdbc.sql("""
                SELECT CONCAT_WS('|', entity_version, outcome) FROM inbox_events
                WHERE aggregate_id = UUID_TO_BIN(:id) ORDER BY processed_at, offset_value
                """).param("id", userId.toString()).query(String.class).list();
    }

    private static MockHttpServletRequestBuilder authorized(MockHttpServletRequestBuilder request) {
        return request.header("Authorization", Tokens.bearer(Tokens.manager()));
    }
}
