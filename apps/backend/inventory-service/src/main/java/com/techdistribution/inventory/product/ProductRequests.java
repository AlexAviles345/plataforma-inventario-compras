package com.techdistribution.inventory.product;

import com.techdistribution.inventory.common.api.ApiException;
import com.techdistribution.inventory.common.api.ErrorDetail;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Validación estricta de entradas. Se hace sobre el árbol JSON para rechazar
 * coerciones silenciosas ("5" o 1.5 como entero) y campos desconocidos, y para
 * devolver todos los errores de campo juntos.
 */
public final class ProductRequests {

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 100;
    /** Number.MAX_SAFE_INTEGER: el frontend representa el stock como número de JavaScript. */
    public static final long MAX_STOCK = 9_007_199_254_740_991L;

    private static final Pattern SKU = Pattern.compile("^[A-Za-z0-9._-]+$");
    private static final Pattern CONTROL = Pattern.compile("\\p{Cntrl}");
    private static final Set<String> CREATE_FIELDS = Set.of("sku", "name", "unit", "stockOnHand");
    private static final Set<String> UPDATE_FIELDS =
            Set.of("expectedVersion", "sku", "name", "stockOnHand", "active", "reason");

    private ProductRequests() {
    }

    public record CreateProduct(String sku, String name, long stockOnHand) {
    }

    public record UpdateProduct(
            long expectedVersion, String sku, String name, long stockOnHand, boolean active, String reason) {
    }

    public record ListQuery(int page, int limit, String search, Boolean active) {
    }

    public static CreateProduct parseCreate(JsonNode body) {
        List<ErrorDetail> errors = new ArrayList<>();
        requireObject(body, CREATE_FIELDS, errors);
        String sku = sku(body, errors);
        String name = name(body, errors);
        JsonNode unit = body == null ? null : body.get("unit");
        if (unit != null && !(unit.isString() && Product.UNIT.equals(unit.stringValue()))) {
            errors.add(ErrorDetail.field("unit", "INVALID_UNIT", "La única unidad permitida es UNIT"));
        }
        long stock = stock(body, errors);
        throwIfAny(errors);
        return new CreateProduct(sku, name, stock);
    }

    public static UpdateProduct parseUpdate(JsonNode body) {
        List<ErrorDetail> errors = new ArrayList<>();
        requireObject(body, UPDATE_FIELDS, errors);
        long expectedVersion = integer(body, "expectedVersion", 1, Long.MAX_VALUE, errors);
        String sku = sku(body, errors);
        String name = name(body, errors);
        long stock = stock(body, errors);
        Boolean active = null;
        JsonNode activeNode = body == null ? null : body.get("active");
        if (activeNode == null || activeNode.isNull()) {
            errors.add(required("active"));
        } else if (!activeNode.isBoolean()) {
            errors.add(ErrorDetail.field("active", "INVALID_TYPE", "Debe ser verdadero o falso"));
        } else {
            active = activeNode.booleanValue();
        }
        String reason = reason(body, errors);
        throwIfAny(errors);
        return new UpdateProduct(expectedVersion, sku, name, stock, active, reason);
    }

    public static ListQuery parseList(String page, String limit, String search, String active) {
        List<ErrorDetail> errors = new ArrayList<>();
        int pageValue = queryInt("page", page, 1, 1, Integer.MAX_VALUE, errors);
        int limitValue = queryInt("limit", limit, DEFAULT_LIMIT, 1, MAX_LIMIT, errors);
        String searchValue = null;
        if (search != null && !search.isBlank()) {
            searchValue = CONTROL.matcher(search).replaceAll(" ").strip();
            if (searchValue.length() > 200) {
                errors.add(ErrorDetail.field("search", "TOO_LONG", "La búsqueda admite como máximo 200 caracteres"));
            }
        }
        Boolean activeValue = null;
        if (active != null && !active.isBlank()) {
            switch (active.strip().toLowerCase(Locale.ROOT)) {
                case "true" -> activeValue = true;
                case "false" -> activeValue = false;
                default -> errors.add(ErrorDetail.field("active", "INVALID_TYPE", "Debe ser true o false"));
            }
        }
        throwIfAny(errors);
        return new ListQuery(pageValue, limitValue, searchValue, activeValue);
    }

    public static UUID productId(String raw) {
        try {
            UUID id = UUID.fromString(raw);
            if (id.toString().equalsIgnoreCase(raw)) {
                return id;
            }
        } catch (IllegalArgumentException ignored) {
            // Se reporta abajo como error de validación.
        }
        throw ApiException.validation("id", "INVALID_UUID", "El identificador debe ser un UUID válido");
    }

    private static void requireObject(JsonNode body, Set<String> allowed, List<ErrorDetail> errors) {
        if (body == null || !body.isObject()) {
            throw ApiException.validation(List.of(new ErrorDetail(null, "INVALID_BODY", "El cuerpo debe ser un objeto JSON")));
        }
        for (Map.Entry<String, JsonNode> property : body.properties()) {
            if (!allowed.contains(property.getKey())) {
                errors.add(ErrorDetail.field(property.getKey(), "UNKNOWN_FIELD", "Campo no permitido"));
            }
        }
    }

    private static String sku(JsonNode body, List<ErrorDetail> errors) {
        String value = string(body, "sku", errors);
        if (value == null) {
            return null;
        }
        value = value.strip();
        if (value.isEmpty()) {
            errors.add(required("sku"));
        } else if (value.length() > 64) {
            errors.add(ErrorDetail.field("sku", "TOO_LONG", "El SKU admite como máximo 64 caracteres"));
        } else if (!SKU.matcher(value).matches()) {
            errors.add(ErrorDetail.field("sku", "INVALID_FORMAT",
                    "Usa únicamente letras, números, punto, guion o guion bajo"));
        }
        return value.toUpperCase(Locale.ROOT);
    }

    private static String name(JsonNode body, List<ErrorDetail> errors) {
        String value = string(body, "name", errors);
        if (value == null) {
            return null;
        }
        value = CONTROL.matcher(value).replaceAll(" ").strip();
        if (value.isEmpty()) {
            errors.add(required("name"));
        } else if (value.length() > 200) {
            errors.add(ErrorDetail.field("name", "TOO_LONG", "El nombre admite como máximo 200 caracteres"));
        }
        return value;
    }

    private static long stock(JsonNode body, List<ErrorDetail> errors) {
        return integer(body, "stockOnHand", 0, MAX_STOCK, errors);
    }

    private static String reason(JsonNode body, List<ErrorDetail> errors) {
        JsonNode node = body == null ? null : body.get("reason");
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isString()) {
            errors.add(ErrorDetail.field("reason", "INVALID_TYPE", "Debe ser texto"));
            return null;
        }
        String value = CONTROL.matcher(node.stringValue()).replaceAll(" ").strip();
        if (value.length() > 500) {
            errors.add(ErrorDetail.field("reason", "TOO_LONG", "El motivo admite como máximo 500 caracteres"));
        }
        return value.isEmpty() ? null : value;
    }

    private static String string(JsonNode body, String field, List<ErrorDetail> errors) {
        JsonNode node = body == null ? null : body.get(field);
        if (node == null || node.isNull()) {
            errors.add(required(field));
            return null;
        }
        if (!node.isString()) {
            errors.add(ErrorDetail.field(field, "INVALID_TYPE", "Debe ser texto"));
            return null;
        }
        return node.stringValue();
    }

    private static long integer(JsonNode body, String field, long min, long max, List<ErrorDetail> errors) {
        JsonNode node = body == null ? null : body.get(field);
        if (node == null || node.isNull()) {
            errors.add(required(field));
            return 0;
        }
        if (!node.isIntegralNumber() || !node.canConvertToLong()) {
            errors.add(ErrorDetail.field(field, "INVALID_TYPE", "Debe ser un número entero"));
            return 0;
        }
        long value = node.longValue();
        if (value < min || value > max) {
            errors.add(ErrorDetail.field(field, "OUT_OF_RANGE",
                    "Debe estar entre " + min + " y " + max));
        }
        return value;
    }

    private static int queryInt(String field, String raw, int fallback, int min, int max, List<ErrorDetail> errors) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            int value = Integer.parseInt(raw.strip());
            if (value >= min && value <= max) {
                return value;
            }
        } catch (NumberFormatException ignored) {
            // Se reporta abajo como error de validación.
        }
        errors.add(ErrorDetail.field(field, "OUT_OF_RANGE",
                "Debe ser un entero entre " + min + " y " + max));
        return fallback;
    }

    private static ErrorDetail required(String field) {
        return ErrorDetail.field(field, "REQUIRED", "Campo obligatorio");
    }

    private static void throwIfAny(List<ErrorDetail> errors) {
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
    }
}
