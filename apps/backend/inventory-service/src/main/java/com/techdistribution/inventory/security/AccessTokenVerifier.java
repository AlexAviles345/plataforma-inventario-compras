package com.techdistribution.inventory.security;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Valida localmente el access token común (docs/standards/jwt-and-sessions.md):
 * firma HS256, algoritmo fijo, emisor, audiencia, vigencia, TTL máximo, tipos de
 * todos los claims y combinación rol/sistema. No consulta a Auth.
 */
@Component
public class AccessTokenVerifier {

    public static final Set<String> ROLES = Set.of("ADMIN", "INVENTORY_MANAGER", "PURCHASES_AGENT");
    public static final Set<String> SYSTEMS = Set.of("INVENTORY", "PURCHASES");
    private static final long CLOCK_SKEW_SECONDS = 30;
    private static final Pattern BASE64URL = Pattern.compile("^[A-Za-z0-9_-]+$");
    private static final Pattern CANONICAL_UUID = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final JwtProperties properties;
    private final JsonMapper jsonMapper;
    private final Clock clock;
    private final byte[] secret;

    public AccessTokenVerifier(JwtProperties properties, JsonMapper jsonMapper, Clock clock) {
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
        this.secret = properties.secret().getBytes(StandardCharsets.UTF_8);
    }

    public AuthenticatedActor verify(String token) {
        String[] parts = token.split("\\.", -1);
        if (parts.length != 3) {
            throw new InvalidTokenException("Formato de token inválido");
        }
        JsonNode header = parseJson(decode(parts[0]));
        JsonNode payload = parseJson(decode(parts[1]));
        byte[] signature = decode(parts[2]);

        if (!"HS256".equals(text(header, "alg")) || !"JWT".equals(text(header, "typ"))) {
            throw new InvalidTokenException("Algoritmo o tipo de token no permitido");
        }
        byte[] expected = sign((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        if (!MessageDigest.isEqual(signature, expected)) {
            throw new InvalidTokenException("Firma del token inválida");
        }
        if (payload.has("roles")) {
            throw new InvalidTokenException("El claim 'roles' no está permitido");
        }
        if (!properties.issuer().equals(text(payload, "iss"))
                || !properties.audience().equals(text(payload, "aud"))) {
            throw new InvalidTokenException("Emisor o audiencia del token inválidos");
        }

        String sub = text(payload, "sub");
        String email = text(payload, "email");
        String role = text(payload, "role");
        String system = text(payload, "system");
        if (sub == null || !CANONICAL_UUID.matcher(sub).matches()) {
            throw new InvalidTokenException("El claim 'sub' no es un UUID válido");
        }
        if (email == null || !EMAIL.matcher(email).matches()) {
            throw new InvalidTokenException("El claim 'email' no es válido");
        }
        if (role == null || system == null || !isAllowedCombination(role, system)) {
            throw new InvalidTokenException("Combinación de rol y sistema inválida");
        }

        long iat = integer(payload, "iat");
        long exp = integer(payload, "exp");
        long now = clock.instant().getEpochSecond();
        if (iat <= 0 || iat > now + CLOCK_SKEW_SECONDS || exp <= now || exp <= iat
                || exp - iat > properties.maxTtlSeconds()) {
            throw new InvalidTokenException("El token expiró o su vigencia es inválida");
        }
        return new AuthenticatedActor(UUID.fromString(sub), email, role, system);
    }

    static boolean isAllowedCombination(String role, String system) {
        return switch (role) {
            case "ADMIN" -> SYSTEMS.contains(system);
            case "INVENTORY_MANAGER" -> "INVENTORY".equals(system);
            case "PURCHASES_AGENT" -> "PURCHASES".equals(system);
            default -> false;
        };
    }

    private byte[] sign(byte[] input) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(input);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("HmacSHA256 no está disponible", exception);
        }
    }

    private static byte[] decode(String segment) {
        if (segment.isEmpty() || !BASE64URL.matcher(segment).matches()) {
            throw new InvalidTokenException("Segmento del token con Base64URL inválido");
        }
        try {
            return Base64.getUrlDecoder().decode(segment);
        } catch (IllegalArgumentException exception) {
            throw new InvalidTokenException("No fue posible decodificar el token");
        }
    }

    private JsonNode parseJson(byte[] bytes) {
        try {
            JsonNode node = jsonMapper.readTree(bytes);
            if (node == null || !node.isObject()) {
                throw new InvalidTokenException("Estructura del token inválida");
            }
            return node;
        } catch (JacksonException exception) {
            throw new InvalidTokenException("Contenido JSON del token inválido");
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isString() ? value.stringValue() : null;
    }

    private static long integer(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong()) {
            throw new InvalidTokenException("Los claims 'iat' y 'exp' deben ser enteros");
        }
        return value.longValue();
    }
}
