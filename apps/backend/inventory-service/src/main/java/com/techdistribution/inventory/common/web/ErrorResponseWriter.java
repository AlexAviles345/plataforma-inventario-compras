package com.techdistribution.inventory.common.web;

import com.techdistribution.inventory.common.api.ApiErrorResponse;
import com.techdistribution.inventory.common.api.ApiException;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Escribe el contrato de error desde filtros, antes de llegar a los controladores. */
@Component
public class ErrorResponseWriter {

    private final JsonMapper jsonMapper;

    public ErrorResponseWriter(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    public void write(HttpServletResponse response, ApiException exception) throws IOException {
        ApiErrorResponse body = ApiErrorResponse.of(
                exception.status().value(), exception.code(), exception.getMessage(), exception.details());
        response.setStatus(exception.status().value());
        exception.headers().forEach(response::setHeader);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(jsonMapper.writeValueAsString(body));
    }
}
