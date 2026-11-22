-- Catálogo propietario de Inventory. UUID en binary(16) y fechas UTC en datetime(6).
CREATE TABLE products (
    id            BINARY(16)      NOT NULL,
    sku           VARCHAR(64)     NOT NULL,
    name          VARCHAR(200)    NOT NULL,
    unit          VARCHAR(16)     NOT NULL DEFAULT 'UNIT',
    stock_on_hand BIGINT          NOT NULL,
    active        BOOLEAN         NOT NULL DEFAULT TRUE,
    version       BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_by    BINARY(16)      NOT NULL,
    updated_by    BINARY(16)      NOT NULL,
    created_at    DATETIME(6)     NOT NULL,
    updated_at    DATETIME(6)     NOT NULL,
    CONSTRAINT pk_products PRIMARY KEY (id),
    CONSTRAINT uq_products_sku UNIQUE (sku),
    CONSTRAINT ck_products_sku CHECK (CHAR_LENGTH(sku) BETWEEN 1 AND 64),
    CONSTRAINT ck_products_name CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 200),
    CONSTRAINT ck_products_unit CHECK (unit IN ('UNIT')),
    CONSTRAINT ck_products_stock CHECK (stock_on_hand >= 0),
    CONSTRAINT ck_products_version CHECK (version >= 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX ix_products_catalog ON products (active, name, id);
