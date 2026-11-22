package com.techdistribution.inventory.support;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Construye eventos UserCreated/UserUpdated con la forma exacta que publica Auth. */
public final class UserEvents {

    public static final List<Map<String, Object>> INVENTORY_MANAGER =
            List.of(Map.of("system", "INVENTORY", "role", "INVENTORY_MANAGER"));
    public static final List<Map<String, Object>> PURCHASES_AGENT =
            List.of(Map.of("system", "PURCHASES", "role", "PURCHASES_AGENT"));

    private UserEvents() {
    }

    public static Map<String, Object> event(UUID userId, long version, boolean active,
            List<Map<String, Object>> assignments) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("userId", userId.toString());
        data.put("email", "usuario" + version + "@techdistribution.test");
        data.put("displayName", "Usuario v" + version);
        data.put("active", active);
        data.put("assignments", assignments);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("eventType", version == 1 ? "UserCreated" : "UserUpdated");
        event.put("schemaVersion", 1);
        event.put("aggregateId", userId.toString());
        event.put("entityVersion", version);
        event.put("timestamp", Instant.now().toString().replaceAll("(\\.\\d{3})\\d*Z$", "$1Z"));
        event.put("correlationId", UUID.randomUUID().toString());
        event.put("data", data);
        return event;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> data(Map<String, Object> event) {
        return (Map<String, Object>) event.get("data");
    }
}
