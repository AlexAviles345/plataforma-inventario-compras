package com.techdistribution.inventory.projection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.techdistribution.inventory.support.UserEvents;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.json.JsonMapper;

/** Reglas de contracts/events/user-event.schema.json sin levantar Spring. */
class UserEventValidatorTests {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final UserEventValidator validator = new UserEventValidator(JSON);
    private final UUID userId = UUID.randomUUID();

    @Test
    void acceptsAValidSnapshot() {
        Map<String, Object> event = UserEvents.event(userId, 3, true, List.of(
                Map.of("system", "INVENTORY", "role", "ADMIN"), Map.of("system", "PURCHASES", "role", "ADMIN")));
        UserEvent parsed = validator.validate(JSON.writeValueAsString(event), userId.toString());

        assertThat(parsed.userId()).isEqualTo(userId);
        assertThat(parsed.eventType()).isEqualTo("UserUpdated");
        assertThat(parsed.entityVersion()).isEqualTo(3);
        assertThat(parsed.active()).isTrue();
        assertThat(parsed.assignments()).hasSize(2);
    }

    @Test
    void acceptsMissingKeyAndEmptyAssignments() {
        Map<String, Object> event = UserEvents.event(userId, 1, false, List.of());
        assertThat(validator.validate(JSON.writeValueAsString(event), null).assignments()).isEmpty();
    }

    @Test
    void rejectsNonJsonAndKeyMismatch() {
        assertThatThrownBy(() -> validator.validate("{no es json", null))
                .isInstanceOf(PermanentEventException.class);
        String valid = JSON.writeValueAsString(UserEvents.event(userId, 1, true, UserEvents.INVENTORY_MANAGER));
        assertThatThrownBy(() -> validator.validate(valid, UUID.randomUUID().toString()))
                .isInstanceOf(PermanentEventException.class)
                .hasMessageContaining("key");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidEvents")
    void rejectsEventsOutsideTheContract(String scenario, Consumer<Map<String, Object>> mutation) {
        Map<String, Object> event = UserEvents.event(userId, 2, true, UserEvents.INVENTORY_MANAGER);
        mutation.accept(event);
        String raw = JSON.writeValueAsString(event);
        assertThatThrownBy(() -> validator.validate(raw, null)).isInstanceOf(PermanentEventException.class);
    }

    static Stream<Arguments> invalidEvents() {
        return Stream.of(
                scenario("campo extra en el sobre", e -> e.put("extra", 1)),
                scenario("falta correlationId", e -> e.remove("correlationId")),
                scenario("tipo de producto", e -> e.put("eventType", "ProductUpdated")),
                scenario("schemaVersion 2", e -> e.put("schemaVersion", 2)),
                scenario("entityVersion 0", e -> e.put("entityVersion", 0)),
                scenario("entityVersion texto", e -> e.put("entityVersion", "2")),
                scenario("eventId no UUID", e -> e.put("eventId", "abc")),
                scenario("timestamp sin Z", e -> e.put("timestamp", "2026-11-22T10:00:00+01:00")),
                scenario("userId distinto de aggregateId", e -> UserEvents.data(e).put("userId", UUID.randomUUID().toString())),
                scenario("password en data", e -> UserEvents.data(e).put("passwordHash", "x")),
                scenario("email inválido", e -> UserEvents.data(e).put("email", "sin-arroba")),
                scenario("displayName vacío", e -> UserEvents.data(e).put("displayName", "")),
                scenario("active texto", e -> UserEvents.data(e).put("active", "true")),
                scenario("rol de compras en inventario", e -> UserEvents.data(e).put("assignments",
                        List.of(Map.of("system", "INVENTORY", "role", "PURCHASES_AGENT")))),
                scenario("asignación repetida", e -> UserEvents.data(e).put("assignments",
                        List.of(Map.of("system", "INVENTORY", "role", "ADMIN"),
                                Map.of("system", "INVENTORY", "role", "ADMIN")))),
                scenario("tres asignaciones", e -> UserEvents.data(e).put("assignments", List.of(
                        Map.of("system", "INVENTORY", "role", "ADMIN"),
                        Map.of("system", "PURCHASES", "role", "ADMIN"),
                        Map.of("system", "INVENTORY", "role", "INVENTORY_MANAGER")))));
    }

    private static Arguments scenario(String name, Consumer<Map<String, Object>> mutation) {
        return Arguments.of(name, mutation);
    }
}
