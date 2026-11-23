package com.techdistribution.inventory.projection;

import com.techdistribution.inventory.common.api.UtcTimestamps;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Aplica las reglas de contracts/events/event-envelope.schema.json y
 * user-event.schema.json (v1 rechaza campos desconocidos), además de comprobar
 * que la key de Kafka y data.userId coincidan con aggregateId.
 */
@Component
public class UserEventValidator {

    private static final Set<String> ENVELOPE_FIELDS = Set.of(
            "eventId", "eventType", "schemaVersion", "aggregateId", "entityVersion", "timestamp",
            "correlationId", "data");
    private static final Set<String> DATA_FIELDS = Set.of("userId", "email", "displayName", "active", "assignments");
    private static final Set<String> ASSIGNMENT_FIELDS = Set.of("system", "role");
    private static final Set<String> EVENT_TYPES = Set.of("UserCreated", "UserUpdated");
    private static final Map<String, Set<String>> ROLES_BY_SYSTEM = Map.of(
            "INVENTORY", Set.of("ADMIN", "INVENTORY_MANAGER"),
            "PURCHASES", Set.of("ADMIN", "PURCHASES_AGENT"));
    private static final Pattern UUID_TEXT = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern UTC_TIMESTAMP =
            Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?Z$");

    private final JsonMapper jsonMapper;

    public UserEventValidator(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    public UserEvent validate(String rawPayload, String partitionKey) {
        if (rawPayload == null || rawPayload.isBlank()) {
            throw new PermanentEventException("El mensaje está vacío");
        }
        JsonNode root;
        try {
            root = jsonMapper.readTree(rawPayload);
        } catch (JacksonException exception) {
            throw new PermanentEventException("El mensaje no es un JSON válido");
        }
        requireExactFields(root, ENVELOPE_FIELDS, "evento");

        UUID eventId = uuid(root, "eventId");
        String eventType = text(root, "eventType");
        if (!EVENT_TYPES.contains(eventType)) {
            throw new PermanentEventException("eventType no permitido para usuarios: " + eventType);
        }
        if (integer(root, "schemaVersion") != 1) {
            throw new PermanentEventException("schemaVersion no soportada");
        }
        UUID aggregateId = uuid(root, "aggregateId");
        long entityVersion = integer(root, "entityVersion");
        if (entityVersion < 1) {
            throw new PermanentEventException("entityVersion debe ser mayor o igual a 1");
        }
        Instant occurredAt = timestamp(root);
        UUID correlationId = uuid(root, "correlationId");

        if (partitionKey == null || partitionKey.isBlank()) {
            throw new PermanentEventException("La key de Kafka es obligatoria");
        }
        if (!UUID_TEXT.matcher(partitionKey).matches()
                || !UUID.fromString(partitionKey).equals(aggregateId)) {
            throw new PermanentEventException("La key de Kafka no coincide con aggregateId");
        }

        JsonNode data = root.get("data");
        requireExactFields(data, DATA_FIELDS, "data");
        if (!uuid(data, "userId").equals(aggregateId)) {
            throw new PermanentEventException("data.userId no coincide con aggregateId");
        }
        String email = text(data, "email");
        if (!EMAIL.matcher(email).matches()) {
            throw new PermanentEventException("data.email no es válido");
        }
        String displayName = text(data, "displayName");
        int length = displayName.codePointCount(0, displayName.length());
        if (length < 1 || length > 200) {
            throw new PermanentEventException("data.displayName debe tener entre 1 y 200 caracteres");
        }
        JsonNode active = data.get("active");
        if (!active.isBoolean()) {
            throw new PermanentEventException("data.active debe ser booleano");
        }
        return new UserEvent(eventId, eventType, aggregateId, entityVersion, occurredAt, correlationId, email,
                displayName, active.booleanValue(), assignments(data.get("assignments")));
    }

    private static final Set<String> SNAPSHOT_REQUIRED = Set.of(
            "userId", "email", "displayName", "active", "assignments", "entityVersion");
    private static final Set<String> SNAPSHOT_OPTIONAL = Set.of("sourceEventId", "sourceEventAt");

    /**
     * Valida un elemento de snapshot de usuarios (mismo formato que acepta el
     * importador de Purchases) y lo convierte en un evento equivalente.
     */
    public UserEvent validateSnapshotItem(JsonNode item) {
        if (item == null || !item.isObject()) {
            throw new PermanentEventException("Cada elemento del snapshot debe ser un objeto");
        }
        Set<String> present = new HashSet<>();
        for (Map.Entry<String, JsonNode> property : item.properties()) {
            present.add(property.getKey());
        }
        if (!present.containsAll(SNAPSHOT_REQUIRED)) {
            throw new PermanentEventException("Faltan campos obligatorios: " + SNAPSHOT_REQUIRED);
        }
        for (String field : present) {
            if (!SNAPSHOT_REQUIRED.contains(field) && !SNAPSHOT_OPTIONAL.contains(field)) {
                throw new PermanentEventException("Campo no permitido en el snapshot: " + field);
            }
        }
        UUID userId = uuid(item, "userId");
        long entityVersion = integer(item, "entityVersion");
        if (entityVersion < 1) {
            throw new PermanentEventException("entityVersion debe ser mayor o igual a 1");
        }
        String email = text(item, "email").strip().toLowerCase(java.util.Locale.ROOT);
        if (!EMAIL.matcher(email).matches()) {
            throw new PermanentEventException("email no es válido");
        }
        String displayName = text(item, "displayName").strip();
        int length = displayName.codePointCount(0, displayName.length());
        if (length < 1 || length > 200) {
            throw new PermanentEventException("displayName debe tener entre 1 y 200 caracteres");
        }
        JsonNode active = item.get("active");
        if (!active.isBoolean()) {
            throw new PermanentEventException("active debe ser booleano");
        }
        UUID sourceEventId = item.hasNonNull("sourceEventId") ? uuid(item, "sourceEventId") : UUID.randomUUID();
        Instant sourceEventAt = item.hasNonNull("sourceEventAt") ? timestamp(item, "sourceEventAt")
                : UtcTimestamps.now();
        return new UserEvent(sourceEventId, "UserUpdated", userId, entityVersion, sourceEventAt,
                UUID.randomUUID(), email, displayName, active.booleanValue(), assignments(item.get("assignments")));
    }

    private static List<UserEvent.Assignment> assignments(JsonNode node) {
        if (!node.isArray() || node.size() > 2) {
            throw new PermanentEventException("data.assignments debe ser un arreglo de máximo 2 elementos");
        }
        List<UserEvent.Assignment> assignments = new ArrayList<>();
        Set<UserEvent.Assignment> seen = new HashSet<>();
        for (JsonNode item : node) {
            requireExactFields(item, ASSIGNMENT_FIELDS, "assignment");
            UserEvent.Assignment assignment = new UserEvent.Assignment(text(item, "system"), text(item, "role"));
            Set<String> roles = ROLES_BY_SYSTEM.get(assignment.system());
            if (roles == null || !roles.contains(assignment.role())) {
                throw new PermanentEventException("Asignación de sistema y rol inválida");
            }
            if (!seen.add(assignment)) {
                throw new PermanentEventException("data.assignments contiene elementos repetidos");
            }
            assignments.add(assignment);
        }
        return List.copyOf(assignments);
    }

    private static void requireExactFields(JsonNode node, Set<String> expected, String context) {
        if (node == null || !node.isObject()) {
            throw new PermanentEventException("Se esperaba un objeto JSON en " + context);
        }
        Set<String> present = new HashSet<>();
        for (Map.Entry<String, JsonNode> property : node.properties()) {
            present.add(property.getKey());
        }
        if (!present.equals(expected)) {
            throw new PermanentEventException("Campos inválidos en " + context
                    + ": se esperaban exactamente " + expected);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isString()) {
            throw new PermanentEventException(field + " debe ser texto");
        }
        return value.stringValue();
    }

    private static long integer(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong()) {
            throw new PermanentEventException(field + " debe ser un entero");
        }
        return value.longValue();
    }

    private static UUID uuid(JsonNode node, String field) {
        String value = text(node, field);
        if (!UUID_TEXT.matcher(value).matches()) {
            throw new PermanentEventException(field + " debe ser un UUID");
        }
        return UUID.fromString(value);
    }

    private static Instant timestamp(JsonNode node) {
        return timestamp(node, "timestamp");
    }

    private static Instant timestamp(JsonNode node, String field) {
        String value = text(node, field);
        if (!UTC_TIMESTAMP.matcher(value).matches()) {
            throw new PermanentEventException("timestamp debe ser una fecha UTC terminada en Z");
        }
        try {
            return UtcTimestamps.truncate(Instant.parse(value));
        } catch (DateTimeParseException exception) {
            throw new PermanentEventException("timestamp no es una fecha válida");
        }
    }
}
