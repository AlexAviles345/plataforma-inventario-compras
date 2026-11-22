-- Historial append-only del stock inicial y de sus correcciones explícitas.
CREATE TABLE stock_adjustments (
    id              BINARY(16)      NOT NULL,
    product_id      BINARY(16)      NOT NULL,
    product_version BIGINT UNSIGNED NOT NULL,
    adjustment_type VARCHAR(16)     NOT NULL,
    previous_stock  BIGINT          NOT NULL,
    new_stock       BIGINT          NOT NULL,
    delta           BIGINT          NOT NULL,
    reason          VARCHAR(500)    NOT NULL,
    actor_user_id   BINARY(16)      NOT NULL,
    request_id      BINARY(16)      NOT NULL,
    created_at      DATETIME(6)     NOT NULL,
    CONSTRAINT pk_stock_adjustments PRIMARY KEY (id),
    CONSTRAINT fk_stock_adjustments_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE RESTRICT,
    CONSTRAINT uq_stock_adjustments_product_version UNIQUE (product_id, product_version),
    CONSTRAINT ck_stock_adjustments_type CHECK (adjustment_type IN ('INITIAL', 'CORRECTION')),
    CONSTRAINT ck_stock_adjustments_previous CHECK (previous_stock >= 0),
    CONSTRAINT ck_stock_adjustments_new CHECK (new_stock >= 0),
    CONSTRAINT ck_stock_adjustments_delta CHECK (delta = new_stock - previous_stock),
    CONSTRAINT ck_stock_adjustments_initial CHECK (adjustment_type <> 'INITIAL' OR previous_stock = 0),
    CONSTRAINT ck_stock_adjustments_reason CHECK (CHAR_LENGTH(TRIM(reason)) BETWEEN 1 AND 500)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX ix_stock_adjustments_product_created ON stock_adjustments (product_id, created_at);
