import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Crea el catálogo de sistemas y siembra exactamente INVENTORY y PURCHASES. */
export class CreateSystems1794614400002 implements MigrationInterface {
  name = 'CreateSystems1794614400002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "systems" (
        "code" varchar(32) NOT NULL,
        "access_token_ttl_seconds" integer NOT NULL,
        "version" bigint NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_systems" PRIMARY KEY ("code"),
        CONSTRAINT "ck_systems_code" CHECK (code IN ('INVENTORY', 'PURCHASES')),
        CONSTRAINT "ck_systems_access_token_ttl"
          CHECK (access_token_ttl_seconds > 0 AND access_token_ttl_seconds <= 3600),
        CONSTRAINT "ck_systems_version" CHECK (version >= 1)
      )
    `);
    await queryRunner.query(`
      INSERT INTO "systems" ("code", "access_token_ttl_seconds")
      VALUES ('INVENTORY', 900), ('PURCHASES', 900)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "systems"`);
  }
}
