package com.techdistribution.inventory.common.api;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Envoltura estándar de éxito (docs/standards/api-responses.md). {@code data}
 * siempre se serializa, incluso como {@code null}; {@code meta} solo cuando existe.
 */
public record ApiResponse<T>(
        boolean error,
        int statusCode,
        String message,
        T data,
        @JsonInclude(JsonInclude.Include.NON_NULL) PaginationMeta meta) {

    public static <T> ApiResponse<T> of(int statusCode, String message, T data) {
        return new ApiResponse<>(false, statusCode, message, data, null);
    }

    public static <T> ApiResponse<T> paginated(String message, T data, PaginationMeta meta) {
        return new ApiResponse<>(false, 200, message, data, meta);
    }
}
