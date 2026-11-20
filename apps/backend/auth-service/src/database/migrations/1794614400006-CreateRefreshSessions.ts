import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshSessions1794614400006 implements MigrationInterface {
  name = 'CreateRefreshSessions1794614400006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" uuid NOT NULL,
        "family_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "system_code" varchar(32) NOT NULL,
        "token_hash" char(64) NOT NULL,
        "csrf_hash" char(64) NOT NULL,
        "created_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "last_used_at" timestamptz,
        "revoked_at" timestamptz,
        "replaced_by_id" uuid,
        CONSTRAINT "pk_refresh_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_refresh_sessions_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "ck_refresh_sessions_token_hash" CHECK (char_length(token_hash) = 64),
        CONSTRAINT "ck_refresh_sessions_csrf_hash" CHECK (char_length(csrf_hash) = 64),
        CONSTRAINT "ck_refresh_sessions_expiry" CHECK (expires_at > created_at),
        CONSTRAINT "fk_refresh_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_refresh_sessions_system" FOREIGN KEY ("system_code")
          REFERENCES "systems" ("code") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_refresh_sessions_replacement" FOREIGN KEY ("replaced_by_id")
          REFERENCES "refresh_sessions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_refresh_sessions_family"
        ON "refresh_sessions" ("family_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_refresh_sessions_user_active"
        ON "refresh_sessions" ("user_id", "revoked_at", "expires_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
  }
}
