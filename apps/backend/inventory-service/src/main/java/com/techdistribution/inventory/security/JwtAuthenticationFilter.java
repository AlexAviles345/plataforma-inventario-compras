package com.techdistribution.inventory.security;

import com.techdistribution.inventory.common.api.ApiException;
import com.techdistribution.inventory.common.web.ErrorResponseWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Protege todo {@code /api/inventory/**} salvo el schema OpenAPI. Vuelve a validar
 * el JWT aunque el Gateway ya lo haya hecho y nunca confía en headers x-user-*.
 * Solo ADMIN e INVENTORY_MANAGER con un token del sistema INVENTORY pasan.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    public static final String ACTOR_ATTRIBUTE = JwtAuthenticationFilter.class.getName() + ".actor";
    private static final String PROTECTED_PREFIX = "/api/inventory";
    private static final String OPENAPI_PATH = "/api/inventory/openapi.json";
    private static final Set<String> ALLOWED_ROLES = Set.of("ADMIN", "INVENTORY_MANAGER");
    private static final Pattern BEARER = Pattern.compile("^Bearer ([^\\s]+)$", Pattern.CASE_INSENSITIVE);
    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    private final AccessTokenVerifier verifier;
    private final ErrorResponseWriter errorWriter;

    public JwtAuthenticationFilter(AccessTokenVerifier verifier, ErrorResponseWriter errorWriter) {
        this.verifier = verifier;
        this.errorWriter = errorWriter;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        boolean isProtected = path.equals(PROTECTED_PREFIX) || path.startsWith(PROTECTED_PREFIX + "/");
        return !isProtected || path.equals(OPENAPI_PATH);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            request.setAttribute(ACTOR_ATTRIBUTE, authenticate(request.getHeader(HttpHeaders.AUTHORIZATION)));
        } catch (ApiException exception) {
            errorWriter.write(response, exception);
            return;
        }
        chain.doFilter(request, response);
    }

    private AuthenticatedActor authenticate(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Token no proporcionado");
        }
        Matcher matcher = BEARER.matcher(authorization);
        if (!matcher.matches()) {
            throw invalidToken();
        }
        AuthenticatedActor actor;
        try {
            actor = verifier.verify(matcher.group(1));
        } catch (InvalidTokenException exception) {
            log.debug("Token rechazado: {}", exception.getMessage());
            throw invalidToken();
        }
        if (!"INVENTORY".equals(actor.system())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Token emitido para otro sistema");
        }
        if (!ALLOWED_ROLES.contains(actor.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "No tienes permiso para esta operación");
        }
        return actor;
    }

    private static ApiException invalidToken() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Token inválido o expirado");
    }
}
