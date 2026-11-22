package com.techdistribution.inventory.product;

import io.swagger.v3.oas.annotations.media.Schema;

/** Indicadores agregados del catálogo para el panel de resumen. */
public record ProductStats(
        @Schema(description = "Productos registrados, activos e inactivos") long totalProducts,
        @Schema(description = "Productos activos") long activeProducts,
        @Schema(description = "Productos desactivados") long inactiveProducts,
        @Schema(description = "Productos activos con existencia 0") long outOfStockProducts,
        @Schema(description = "Suma de existencias de todos los productos") long totalUnitsOnHand) {
}
