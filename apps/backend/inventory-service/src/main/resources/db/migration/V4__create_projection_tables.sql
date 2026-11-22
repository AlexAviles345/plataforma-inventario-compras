-- Tablas del consumidor de usuarios de Auth (grupo inventory.auth-users.v1).
-- Solo el consumidor o el importador administrativo escriben en ellas.

CREATE TABLE inbox_events (
    event_id          BINARY(16)      NOT NULL,
    consumer_group    VARCHAR(128)    NOT NULL,
    topic             VARCHAR(255)    NOT NULL,
    partition_number  INT             NOT NULL,
    offset_value      BIGINT          NOT NULL,
    aggregate_id      BINARY(16)      NOT NULL,
    event_type        VARCHAR(64)     NOT NULL,
    schema_version    SMALLINT        NOT NULL,
    entity_version    BIGINT UNSIGNED NOT NULL,
    correlation_id    BINARY(16)      NOT NULL,
    event_occurred_at DATETIME(6)     NOT NULL,
    payload_hash      CHAR(64)        NOT NULL,
    outcome           VARCHAR(24)     NOT NULL,
    processed_at      DATETIME(6)     NOT NULL,
    CONSTRAINT pk_inbox_events PRIMARY KEY (event_id),
    CONSTRAINT uq_inbox_events_position UNIQUE (consumer_group, topic, partition_number, offset_value),
    CONSTRAINT ck_inbox_events_partition CHECK (partition_number >= 0),
    CONSTRAINT ck_inbox_events_offset CHECK (offset_value >= 0),
    CONSTRAINT ck_inbox_events_outcome CHECK (outcome IN ('APPLIED', 'IGNORED_STALE'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE user_projections (
    user_id         BINARY(16)      NOT NULL,
    email           VARCHAR(254)    NOT NULL,
    display_name    VARCHAR(200)    NOT NULL,
    active          BOOLEAN         NOT NULL,
    assignments     JSON            NOT NULL,
    entity_version  BIGINT UNSIGNED NOT NULL,
    source_event_id BINARY(16)      NOT NULL,
    source_event_at DATETIME(6)     NOT NULL,
    projected_at    DATETIME(6)     NOT NULL,
    CONSTRAINT pk_user_projections PRIMARY KEY (user_id),
    CONSTRAINT ck_user_projections_version CHECK (entity_version >= 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX ix_user_projections_email ON user_projections (email);
