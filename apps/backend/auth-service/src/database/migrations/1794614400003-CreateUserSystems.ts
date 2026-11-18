import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSystems1794614400003 implements MigrationInterface {
  name = 'CreateUserSystems1794614400003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_systems" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "system_code" varchar(32) NOT NULL,
        "role" varchar(32) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_systems" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_systems_user_system" UNIQUE ("user_id", "system_code"),
        CONSTRAINT "ck_user_systems_role" CHECK (
          (system_code = 'INVENTORY' AND role IN ('ADMIN', 'INVENTORY_MANAGER'))
          OR (system_code = 'PURCHASES' AND role IN ('ADMIN', 'PURCHASES_AGENT'))
        ),
        CONSTRAINT "fk_user_systems_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_user_systems_system" FOREIGN KEY ("system_code")
          REFERENCES "systems" ("code") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_systems"`);
  }
}
