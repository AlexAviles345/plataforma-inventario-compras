package com.techdistribution.inventory.support;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Emite access tokens HS256 como los de Auth, con claims modificables. */
public final class Tokens {

    public static final String SECRET = "test-secret-with-at-least-thirty-two-bytes-0123456789";
    public static final String ISSUER = "techdistribution-auth";
    public static final String AUDIENCE = "techdistribution-api";
    public static final UUID MANAGER_ID = UUID.fromString("767cc714-0614-4ab9-9510-c4772b403fed");

    private Tokens() {
    }

    public static Map<String, Object> claims(String role, String system) {
        long now = Instant.now().getEpochSecond();
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", MANAGER_ID.toString());
        claims.put("email", "gestor@techdistribution.test");
        claims.put("role", role);
        claims.put("system", system);
        claims.put("iat", now);
        claims.put("exp", now + 900);
        claims.put("iss", ISSUER);
        claims.put("aud", AUDIENCE);
        return claims;
    }

    public static String manager() {
        return sign(claims("INVENTORY_MANAGER", "INVENTORY"));
    }

    public static String bearer(String token) {
        return "Bearer " + token;
    }

    public static String sign(Map<String, Object> claims) {
        return sign(claims, "{\"alg\":\"HS256\",\"typ\":\"JWT\"}", SECRET);
    }

    public static String sign(Map<String, Object> claims, String headerJson, String secret) {
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        String header = encoder.encodeToString(headerJson.getBytes(StandardCharsets.UTF_8));
        String payload = encoder.encodeToString(toJson(claims).getBytes(StandardCharsets.UTF_8));
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signature = mac.doFinal((header + "." + payload).getBytes(StandardCharsets.US_ASCII));
            return header + "." + payload + "." + encoder.encodeToString(signature);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String toJson(Map<String, Object> claims) {
        StringBuilder json = new StringBuilder("{");
        claims.forEach((key, value) -> {
            if (json.length() > 1) {
                json.append(',');
            }
            json.append('"').append(key).append("\":");
            json.append(value instanceof String text ? "\"" + text + "\"" : String.valueOf(value));
        });
        return json.append('}').toString();
    }
}
