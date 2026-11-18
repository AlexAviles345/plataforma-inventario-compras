import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El UNIQUE (aggregate_id, entity_version) ya crea el índice que el publicador
 * usa para respetar el orden por agregado; no se duplica.
 */
export class CreateOutboxEvents1794614400005 implements MigrationInterface {
  name = 'CreateOutboxEvents1794614400005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "event_id" uuid NOT NULL,
        "aggregate_type" varchar(64) NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "event_type" varchar(64) NOT NULL,
        "schema_version" smallint NOT NULL,
        "entity_version" bigint NOT NULL,
        "topic" varchar(255) NOT NULL,
        "partition_key" varchar(128) NOT NULL,
        "payload" jsonb NOT NULL,
        "correlation_id" uuid NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
        "locked_at" timestamptz,
        "locked_by" varchar(128),
        "published_at" timestamptz,
        "last_error" varchar(1000),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_outbox_events" PRIMARY KEY ("event_id"),
        CONSTRAINT "uq_outbox_events_aggregate_version"
          UNIQUE ("aggregate_id", "entity_version"),
        CONSTRAINT "ck_outbox_events_aggregate_type" CHECK (aggregate_type = 'USER'),
        CONSTRAINT "ck_outbox_events_event_type"
          CHECK (event_type IN ('UserCreated', 'UserUpdated')),
        CONSTRAINT "ck_outbox_events_schema_version" CHECK (schema_version >= 1),
        CONSTRAINT "ck_outbox_events_entity_version" CHECK (entity_version >= 1),
        CONSTRAINT "ck_outbox_events_partition_key"
          CHECK (partition_key = aggregate_id::text),
        CONSTRAINT "ck_outbox_events_payload" CHECK (jsonb_typeof(payload) = 'object'),
        CONSTRAINT "ck_outbox_events_status"
          CHECK (status IN ('PENDING', 'PUBLISHING', 'PUBLISHED')),
        CONSTRAINT "ck_outbox_events_attempt_count" CHECK (attempt_count >= 0),
        CONSTRAINT "ck_outbox_events_published_at"
          CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL)),
        CONSTRAINT "ck_outbox_events_lease" CHECK (
          (locked_at IS NULL) = (locked_by IS NULL)
          AND (status <> 'PUBLISHING' OR locked_at IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_outbox_events_dispatch"
        ON "outbox_events" ("status", "next_attempt_at", "created_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "outbox_events"`);
  }
}
