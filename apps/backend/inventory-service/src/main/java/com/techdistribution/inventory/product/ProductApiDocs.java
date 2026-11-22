package com.techdistribution.inventory.product;

import com.techdistribution.inventory.common.api.ErrorDetail;
import com.techdistribution.inventory.common.api.PaginationMeta;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/** Tipos usados solo para documentar en OpenAPI los cuerpos observables. */
final class ProductApiDocs {

    private ProductApiDocs() {
    }

    @Schema(name = "CreateProductRequest")
    record CreateProductBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 64, pattern = "^[A-Za-z0-9._-]+$",
                    description = "Se guarda en mayúsculas; único", example = "LAP-001") String sku,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 1, maxLength = 200,
                    example = "Laptop 14 pulgadas") String name,
            @Schema(allowableValues = "UNIT", description = "Opcional; solo UNIT") String unit,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0", example = "25") long stockOnHand) {
    }

    @Schema(name = "UpdateProductRequest")
    record UpdateProductBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "1",
                    description = "Versión que el cliente leyó; 409 VERSION_CONFLICT si cambió") long expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 64) String sku,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 200) String name,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") long stockOnHand,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    description = "false desactiva lógicamente el producto") boolean active,
            @Schema(maxLength = 500, description = "Obligatorio si cambia stockOnHand") String reason) {
    }

    @Schema(name = "ProductResponse")
    record ProductEnvelope(
            @Schema(example = "false") boolean error,
            @Schema(example = "200") int statusCode,
            String message,
            ProductView data) {
    }

    @Schema(name = "ProductPageResponse")
    record ProductPageEnvelope(
            @Schema(example = "false") boolean error,
            @Schema(example = "200") int statusCode,
            String message,
            List<ProductView> data,
            PaginationMeta meta) {
    }

    @Schema(name = "ProductStatsResponse")
    record StatsEnvelope(
            @Schema(example = "false") boolean error,
            @Schema(example = "200") int statusCode,
            String message,
            ProductStats data) {
    }

    @Schema(name = "ErrorResponse")
    record ErrorEnvelope(
            @Schema(example = "true") boolean error,
            int statusCode,
            @Schema(example = "VALIDATION_ERROR") String code,
            String message,
            @Schema(example = "inventory") String source,
            @Schema(example = "2026-11-22T18:30:00.000000Z") String timestamp,
            List<ErrorDetail> details) {
    }
}
