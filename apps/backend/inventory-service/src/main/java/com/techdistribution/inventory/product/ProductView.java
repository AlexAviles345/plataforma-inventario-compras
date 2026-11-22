package com.techdistribution.inventory.product;

import com.techdistribution.inventory.common.api.UtcTimestamps;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** Representación pública de un producto en la API. */
public record ProductView(
        UUID id,
        @Schema(example = "LAP-001") String sku,
        @Schema(example = "Laptop 14 pulgadas") String name,
        @Schema(allowableValues = "UNIT") String unit,
        long stockOnHand,
        boolean active,
        @Schema(description = "Versión actual; enviarla como expectedVersion al editar") long version,
        UUID createdBy,
        UUID updatedBy,
        @Schema(example = "2026-11-22T18:30:00.000000Z") String createdAt,
        @Schema(example = "2026-11-22T18:30:00.000000Z") String updatedAt) {

    public static ProductView from(Product product) {
        return new ProductView(
                product.getId(),
                product.getSku(),
                product.getName(),
                product.getUnit(),
                product.getStockOnHand(),
                product.isActive(),
                product.getVersion(),
                product.getCreatedBy(),
                product.getUpdatedBy(),
                UtcTimestamps.format(product.getCreatedAt()),
                UtcTimestamps.format(product.getUpdatedAt()));
    }
}
