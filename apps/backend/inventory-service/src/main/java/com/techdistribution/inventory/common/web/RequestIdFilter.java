package com.techdistribution.inventory.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Propaga el {@code X-Request-Id} del Gateway o genera uno nuevo si falta o no es
 * un UUID. Se devuelve siempre en la respuesta y se usa como correlationId.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    private static final String ATTRIBUTE = RequestIdFilter.class.getName() + ".requestId";
    private static final String MDC_KEY = "requestId";

    public static UUID requestId(HttpServletRequest request) {
        Object value = request.getAttribute(ATTRIBUTE);
        return value instanceof UUID uuid ? uuid : UUID.randomUUID();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        UUID requestId = parse(request.getHeader(HEADER));
        request.setAttribute(ATTRIBUTE, requestId);
        response.setHeader(HEADER, requestId.toString());
        MDC.put(MDC_KEY, requestId.toString());
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    private static UUID parse(String raw) {
        if (raw != null) {
            try {
                return UUID.fromString(raw.strip());
            } catch (IllegalArgumentException ignored) {
                // Un valor inválido no se propaga: se reemplaza por uno nuevo.
            }
        }
        return UUID.randomUUID();
    }
}
