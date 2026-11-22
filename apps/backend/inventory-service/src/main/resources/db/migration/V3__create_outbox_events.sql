-- Outbox transaccional: el producto y su evento se confirman en la misma transacción.
CREATE TABLE outbox_events (
    event_id        BINARY(16)      NOT NULL,
    aggregate_type  VARCHAR(64)     NOT NULL,
    aggregate_id    BINARY(16)      NOT NULL,
    event_type      VARCHAR(64)     NOT NULL,
    schema_version  SMALLINT        NOT NULL,
    entity_version  BIGINT UNSIGNED NOT NULL,
    topic           VARCHAR(255)    NOT NULL,
    partition_key   VARCHAR(128)    NOT NULL,
    payload         JSON            NOT NULL,
    correlation_id  BINARY(16)      NOT NULL,
    occurred_at     DATETIME(6)     NOT NULL,
    status          VARCHAR(16)     NOT NULL DEFAULT 'PENDING',
    attempt_count   INT             NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6)     NOT NULL,
    locked_at       DATETIME(6)     NULL,
    locked_by       VARCHAR(128)    NULL,
    published_at    DATETIME(6)     NULL,
    last_error      VARCHAR(1000)   NULL,
    created_at      DATETIME(6)     NOT NULL,
    CONSTRAINT pk_outbox_events PRIMARY KEY (event_id),
    CONSTRAINT uq_outbox_events_aggregate_version UNIQUE (aggregate_id, entity_version),
    CONSTRAINT ck_outbox_events_aggregate_type CHECK (aggregate_type IN ('PRODUCT')),
    CONSTRAINT ck_outbox_events_event_type CHECK (event_type IN ('ProductCreated', 'ProductUpdated')),
    CONSTRAINT ck_outbox_events_schema_version CHECK (schema_version = 1),
    CONSTRAINT ck_outbox_events_entity_version CHECK (entity_version >= 1),
    CONSTRAINT ck_outbox_events_status CHECK (status IN ('PENDING', 'PUBLISHING', 'PUBLISHED')),
    CONSTRAINT ck_outbox_events_attempts CHECK (attempt_count >= 0),
    CONSTRAINT ck_outbox_events_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX ix_outbox_events_pending ON outbox_events (status, next_attempt_at, created_at);
