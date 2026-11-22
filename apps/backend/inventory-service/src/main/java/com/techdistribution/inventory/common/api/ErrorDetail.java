package com.techdistribution.inventory.common.api;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Detalle de error; {@code field} usa la ruta JSON que ve el cliente. */
public record ErrorDetail(
        @JsonInclude(JsonInclude.Include.NON_NULL) String field,
        String code,
        String message) {

    public static ErrorDetail field(String field, String code, String message) {
        return new ErrorDetail(field, code, message);
    }
}
