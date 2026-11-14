import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1794614400001 implements MigrationInterface {
  name = 'CreateUsers1794614400001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "display_name" varchar(200) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "version" bigint NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "ck_users_email_normalized"
          CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
        CONSTRAINT "ck_users_display_name"
          CHECK (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 200),
        CONSTRAINT "ck_users_version" CHECK (version >= 1)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
