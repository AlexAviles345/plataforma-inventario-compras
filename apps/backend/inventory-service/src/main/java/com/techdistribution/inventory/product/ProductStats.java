package com.techdistribution.inventory.product;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/** Indicadores agregados del catálogo para el panel de resumen. */
public record ProductStats(
        @Schema(description = "Productos registrados, activos e inactivos") long totalProducts,
        @Schema(description = "Productos activos") long activeProducts,
        @Schema(description = "Productos desactivados") long inactiveProducts,
        @Schema(description = "Productos activos con existencia 0") long outOfStockProducts,
        @Schema(description = "Suma de existencias de todos los productos") long totalUnitsOnHand,
        @Schema(description = "Productos activos con menor stock para alerta de reabastecimiento") List<StockItem> lowStockProducts,
        @Schema(description = "Productos activos con mayor volumen de existencias") List<StockItem> topStockProducts) {

    public record Totals(
            long totalProducts,
            long activeProducts,
            long inactiveProducts,
            long outOfStockProducts,
            long totalUnitsOnHand) {
    }

    public record StockItem(
            @Schema(description = "Identificador del producto") UUID id,
            @Schema(description = "Código SKU") String sku,
            @Schema(description = "Nombre del producto") String name,
            @Schema(description = "Existencias disponibles") long stockOnHand) {

        public static StockItem from(Product product) {
            return new StockItem(product.getId(), product.getSku(), product.getName(), product.getStockOnHand());
        }
    }
}
