package com.techdistribution.inventory.product;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Registro append-only del stock inicial o de una corrección explícita. */
@Entity
@Table(name = "stock_adjustments")
public class StockAdjustment {

    public static final String INITIAL = "INITIAL";
    public static final String CORRECTION = "CORRECTION";
    public static final String INITIAL_REASON = "Existencia inicial al registrar el producto";

    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "id", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID id;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "product_id", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "product_version", nullable = false, updatable = false)
    private long productVersion;

    @Column(name = "adjustment_type", nullable = false, updatable = false, length = 16)
    private String adjustmentType;

    @Column(name = "previous_stock", nullable = false, updatable = false)
    private long previousStock;

    @Column(name = "new_stock", nullable = false, updatable = false)
    private long newStock;

    @Column(name = "delta", nullable = false, updatable = false)
    private long delta;

    @Column(name = "reason", nullable = false, updatable = false, length = 500)
    private String reason;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "actor_user_id", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID actorUserId;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "request_id", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID requestId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected StockAdjustment() {
    }

    public static StockAdjustment initial(Product product, UUID requestId) {
        return of(product, INITIAL, 0, INITIAL_REASON, requestId);
    }

    public static StockAdjustment correction(Product product, long previousStock, String reason, UUID requestId) {
        return of(product, CORRECTION, previousStock, reason, requestId);
    }

    private static StockAdjustment of(
            Product product, String type, long previousStock, String reason, UUID requestId) {
        StockAdjustment adjustment = new StockAdjustment();
        adjustment.id = UUID.randomUUID();
        adjustment.productId = product.getId();
        adjustment.productVersion = product.getVersion();
        adjustment.adjustmentType = type;
        adjustment.previousStock = previousStock;
        adjustment.newStock = product.getStockOnHand();
        adjustment.delta = product.getStockOnHand() - previousStock;
        adjustment.reason = reason;
        adjustment.actorUserId = product.getUpdatedBy();
        adjustment.requestId = requestId;
        adjustment.createdAt = product.getUpdatedAt();
        return adjustment;
    }

    public UUID getProductId() {
        return productId;
    }

    public long getProductVersion() {
        return productVersion;
    }

    public String getAdjustmentType() {
        return adjustmentType;
    }

    public long getPreviousStock() {
        return previousStock;
    }

    public long getNewStock() {
        return newStock;
    }

    public long getDelta() {
        return delta;
    }

    public String getReason() {
        return reason;
    }
}
