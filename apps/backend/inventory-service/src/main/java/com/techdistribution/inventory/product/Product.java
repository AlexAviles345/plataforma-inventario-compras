package com.techdistribution.inventory.product;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Producto del catálogo. La versión se incrementa explícitamente en cada cambio
 * bajo un bloqueo pesimista de la fila, así coincide con la versión del evento.
 */
@Entity
@Table(name = "products")
public class Product {

    public static final String UNIT = "UNIT";

    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "id", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "sku", nullable = false, length = 64)
    private String sku;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "unit", nullable = false, length = 16)
    private String unit;

    @Column(name = "stock_on_hand", nullable = false)
    private long stockOnHand;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "version", nullable = false)
    private long version;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "created_by", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID createdBy;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "updated_by", columnDefinition = "binary(16)", nullable = false)
    private UUID updatedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Product() {
    }

    public static Product create(UUID id, String sku, String name, long stockOnHand, UUID actor, Instant now) {
        Product product = new Product();
        product.id = id;
        product.sku = sku;
        product.name = name;
        product.unit = UNIT;
        product.stockOnHand = stockOnHand;
        product.active = true;
        product.version = 1;
        product.createdBy = actor;
        product.updatedBy = actor;
        product.createdAt = now;
        product.updatedAt = now;
        return product;
    }

    public boolean differsFrom(String sku, String name, long stockOnHand, boolean active) {
        return !this.sku.equals(sku) || !this.name.equals(name) || this.stockOnHand != stockOnHand
                || this.active != active;
    }

    public void update(String sku, String name, long stockOnHand, boolean active, UUID actor, Instant now) {
        this.sku = sku;
        this.name = name;
        this.stockOnHand = stockOnHand;
        this.active = active;
        this.updatedBy = actor;
        this.updatedAt = now;
        this.version++;
    }

    public UUID getId() {
        return id;
    }

    public String getSku() {
        return sku;
    }

    public String getName() {
        return name;
    }

    public String getUnit() {
        return unit;
    }

    public long getStockOnHand() {
        return stockOnHand;
    }

    public boolean isActive() {
        return active;
    }

    public long getVersion() {
        return version;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public UUID getUpdatedBy() {
        return updatedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
