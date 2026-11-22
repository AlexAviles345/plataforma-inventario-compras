package com.techdistribution.inventory.common.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** Envoltura estándar de error; {@code source} siempre es {@code inventory}. */
public record ApiErrorResponse(
        boolean error,
        int statusCode,
        String code,
        String message,
        String source,
        String timestamp,
        @JsonInclude(JsonInclude.Include.NON_EMPTY) List<ErrorDetail> details) {

    public static final String SOURCE = "inventory";

    public static ApiErrorResponse of(int statusCode, String code, String message, List<ErrorDetail> details) {
        return new ApiErrorResponse(
                true, statusCode, code, message, SOURCE, UtcTimestamps.format(UtcTimestamps.now()), details);
    }
}
