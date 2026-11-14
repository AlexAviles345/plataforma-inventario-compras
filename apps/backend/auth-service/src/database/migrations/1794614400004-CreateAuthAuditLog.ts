import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Auditoría append-only: un trigger rechaza UPDATE y DELETE. */
export class CreateAuthAuditLog1794614400004 implements MigrationInterface {
  name = 'CreateAuthAuditLog1794614400004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_audit_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actor_user_id" uuid,
        "action" varchar(64) NOT NULL,
        "target_type" varchar(64) NOT NULL,
        "target_key" varchar(128),
        "target_version" bigint,
        "request_id" uuid,
        "details" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_auth_audit_log" PRIMARY KEY ("id"),
        CONSTRAINT "ck_auth_audit_log_target_type"
          CHECK (target_type IN ('USER', 'SYSTEM', 'ASSIGNMENT')),
        CONSTRAINT "ck_auth_audit_log_target_version"
          CHECK (target_version IS NULL OR target_version >= 1),
        CONSTRAINT "ck_auth_audit_log_details" CHECK (jsonb_typeof(details) = 'object')
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_auth_audit_log_target"
        ON "auth_audit_log" ("target_type", "target_key", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_auth_audit_log_actor"
        ON "auth_audit_log" ("actor_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE FUNCTION "auth_audit_log_reject_changes"() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'auth_audit_log es append-only';
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "tr_auth_audit_log_append_only"
        BEFORE UPDATE OR DELETE ON "auth_audit_log"
        FOR EACH ROW EXECUTE FUNCTION "auth_audit_log_reject_changes"()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_audit_log"`);
    await queryRunner.query(`DROP FUNCTION "auth_audit_log_reject_changes"()`);
  }
}
