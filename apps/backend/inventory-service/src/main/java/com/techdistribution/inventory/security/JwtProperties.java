package com.techdistribution.inventory.security;

import java.nio.charset.StandardCharsets;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuración compartida con Auth y el Gateway. El arranque falla si el secreto
 * falta, es el valor de ejemplo o tiene menos de 32 bytes.
 */
@ConfigurationProperties(prefix = "inventory.jwt")
public record JwtProperties(String secret, String issuer, String audience, long maxTtlSeconds) {

    public JwtProperties {
        if (secret == null || secret.isBlank() || secret.toLowerCase().contains("replace")) {
            throw new IllegalStateException(
                    "JWT_SECRET no está configurado. Ejecuta npm run setup o copia el secreto de Auth en .env");
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT_SECRET debe tener al menos 32 bytes");
        }
        if (issuer == null || issuer.isBlank() || audience == null || audience.isBlank()) {
            throw new IllegalStateException("JWT_ISSUER y JWT_AUDIENCE son obligatorios");
        }
        if (maxTtlSeconds <= 0 || maxTtlSeconds > 3600) {
            throw new IllegalStateException("JWT_MAX_TTL_SECONDS debe estar entre 1 y 3600");
        }
    }
}
