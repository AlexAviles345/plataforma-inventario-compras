package com.techdistribution.inventory.common.api;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

/** Error de negocio o de entrada que se traduce al contrato de error común. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final List<ErrorDetail> details;
    private final Map<String, String> headers;

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, List.of(), Map.of());
    }

    public ApiException(HttpStatus status, String code, String message, List<ErrorDetail> details) {
        this(status, code, message, details, Map.of());
    }

    public ApiException(
            HttpStatus status, String code, String message, List<ErrorDetail> details, Map<String, String> headers) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = List.copyOf(details);
        this.headers = Map.copyOf(headers);
    }

    public static ApiException validation(List<ErrorDetail> details) {
        return new ApiException(
                HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "La solicitud contiene datos inválidos", details);
    }

    public static ApiException validation(String field, String code, String message) {
        return validation(List.of(ErrorDetail.field(field, code, message)));
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", message);
    }

    public static ApiException versionConflict() {
        return new ApiException(
                HttpStatus.CONFLICT, "VERSION_CONFLICT", "El recurso fue modificado por otra operación");
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public List<ErrorDetail> details() {
        return details;
    }

    public Map<String, String> headers() {
        return headers;
    }
}
