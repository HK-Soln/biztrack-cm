import { MigrationInterface, QueryRunner } from "typeorm";

export class AuthFlowUpdate1775299999999 implements MigrationInterface {
    name = 'AuthFlowUpdate1775299999999'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."businesses_business_status_enum" AS ENUM('ONBOARDING', 'PLAN_PENDING', 'ACTIVE')`);
        await queryRunner.query(`ALTER TABLE "businesses" ADD "business_status" "public"."businesses_business_status_enum" NOT NULL DEFAULT 'ONBOARDING'`);
        await queryRunner.query(`DROP INDEX "public"."unq_businesses_owner_id"`);
        await queryRunner.query(`CREATE INDEX "idx_businesses_owner_id" ON "businesses" ("owner_id")`);

        await queryRunner.query(`CREATE TYPE "public"."business_members_role_enum" AS ENUM('OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT')`);
        await queryRunner.query(`CREATE TYPE "public"."business_members_status_enum" AS ENUM('ACTIVE', 'PENDING', 'REMOVED')`);
        await queryRunner.query(`CREATE TABLE "business_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "business_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" "public"."business_members_role_enum" NOT NULL DEFAULT 'CASHIER', "status" "public"."business_members_status_enum" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_3d3a7c0a1a9b3dcd9fdca64a0d8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "unq_business_members_business_id_user_id" ON "business_members" ("business_id", "user_id")`);
        await queryRunner.query(`CREATE INDEX "idx_business_members_business_id" ON "business_members" ("business_id")`);
        await queryRunner.query(`CREATE INDEX "idx_business_members_user_id" ON "business_members" ("user_id")`);
        await queryRunner.query(`ALTER TABLE "business_members" ADD CONSTRAINT "fk_business_members_business_id" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "business_members" ADD CONSTRAINT "fk_business_members_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        await queryRunner.query(`CREATE TABLE "pending_invites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "token" character varying NOT NULL, "business_id" uuid NOT NULL, "role" "public"."business_members_role_enum" NOT NULL, "phone" character varying, "email" character varying, "invited_by_id" uuid, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_82614c05db1c1f5a6e1f1e4e0a7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "unq_pending_invites_token" ON "pending_invites" ("token")`);
        await queryRunner.query(`CREATE INDEX "idx_pending_invites_business_id" ON "pending_invites" ("business_id")`);
        await queryRunner.query(`ALTER TABLE "pending_invites" ADD CONSTRAINT "fk_pending_invites_business_id" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "pending_invites" ADD CONSTRAINT "fk_pending_invites_invited_by_id" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "business_id" uuid`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "token_type" character varying NOT NULL DEFAULT 'phase2'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "token_type"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "business_id"`);

        await queryRunner.query(`ALTER TABLE "pending_invites" DROP CONSTRAINT "fk_pending_invites_invited_by_id"`);
        await queryRunner.query(`ALTER TABLE "pending_invites" DROP CONSTRAINT "fk_pending_invites_business_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_pending_invites_business_id"`);
        await queryRunner.query(`DROP INDEX "public"."unq_pending_invites_token"`);
        await queryRunner.query(`DROP TABLE "pending_invites"`);

        await queryRunner.query(`ALTER TABLE "business_members" DROP CONSTRAINT "fk_business_members_user_id"`);
        await queryRunner.query(`ALTER TABLE "business_members" DROP CONSTRAINT "fk_business_members_business_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_business_members_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_business_members_business_id"`);
        await queryRunner.query(`DROP INDEX "public"."unq_business_members_business_id_user_id"`);
        await queryRunner.query(`DROP TABLE "business_members"`);
        await queryRunner.query(`DROP TYPE "public"."business_members_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."business_members_role_enum"`);

        await queryRunner.query(`DROP INDEX "public"."idx_businesses_owner_id"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "unq_businesses_owner_id" ON "businesses" ("owner_id")`);
        await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "business_status"`);
        await queryRunner.query(`DROP TYPE "public"."businesses_business_status_enum"`);
    }

}
