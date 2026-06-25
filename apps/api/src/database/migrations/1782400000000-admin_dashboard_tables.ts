import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Admin dashboard foundation tables (dynamic RBAC). Owned here because apps/api is the
 * single migration runner for the shared database; apps/admin-api only defines entities.
 *
 * Tables: admin_roles, admin_role_permissions, admin_users, admin_refresh_tokens,
 *         audit_logs, support_tickets.
 */
export class AdminDashboardTables1782400000000 implements MigrationInterface {
  name = 'AdminDashboardTables1782400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)

    // --- admin_roles --------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(100) NOT NULL,
        "description" text,
        "is_system_role" boolean NOT NULL DEFAULT false,
        "created_by" uuid,
        CONSTRAINT "pk_admin_roles" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "unq_admin_roles_name" ON "admin_roles" ("name")`)

    // --- admin_role_permissions --------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_role_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "admin_role_id" uuid NOT NULL,
        "permission" varchar(100) NOT NULL,
        "scope" jsonb,
        CONSTRAINT "pk_admin_role_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_admin_role_permissions_role_id" FOREIGN KEY ("admin_role_id")
          REFERENCES "admin_roles"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_admin_role_permissions_role_permission" ON "admin_role_permissions" ("admin_role_id", "permission")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_admin_role_permissions_role" ON "admin_role_permissions" ("admin_role_id")`,
    )

    // --- admin_users --------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(100) NOT NULL,
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "admin_role_id" uuid NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_super_admin" boolean NOT NULL DEFAULT false,
        "must_change_password" boolean NOT NULL DEFAULT false,
        "failed_login_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "last_login_at" timestamptz,
        "created_by" uuid,
        CONSTRAINT "pk_admin_users" PRIMARY KEY ("id"),
        CONSTRAINT "fk_admin_users_role_id" FOREIGN KEY ("admin_role_id")
          REFERENCES "admin_roles"("id") ON DELETE RESTRICT
      )
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "unq_admin_users_email" ON "admin_users" ("email")`)

    // --- admin_refresh_tokens ----------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "token_id" varchar NOT NULL,
        "token_hash" varchar NOT NULL,
        "family_id" varchar NOT NULL,
        "admin_user_id" uuid NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "revoked_at" timestamptz,
        CONSTRAINT "pk_admin_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "fk_admin_refresh_tokens_admin_user_id" FOREIGN KEY ("admin_user_id")
          REFERENCES "admin_users"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_admin_refresh_tokens_token_id" ON "admin_refresh_tokens" ("token_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_admin_refresh_tokens_family_id" ON "admin_refresh_tokens" ("family_id")`,
    )

    // --- admin_audit_logs ---------------------------------------------------
    // NOTE: namespaced `admin_*` — the client API already owns a different `audit_logs`
    // table (business activity log). The two must not collide in the shared DB.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "admin_user_id" uuid NOT NULL,
        "admin_role_name" varchar(100) NOT NULL,
        "action" varchar(100) NOT NULL,
        "entity_type" varchar(50) NOT NULL,
        "entity_id" uuid,
        "payload" jsonb,
        "ip_address" varchar(45) NOT NULL,
        "user_agent" varchar(255) NOT NULL,
        CONSTRAINT "pk_admin_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_admin_audit_logs_admin_user_id" FOREIGN KEY ("admin_user_id")
          REFERENCES "admin_users"("id") ON DELETE RESTRICT
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_admin_user" ON "admin_audit_logs" ("admin_user_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_entity" ON "admin_audit_logs" ("entity_type", "entity_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_created_at" ON "admin_audit_logs" ("created_at")`,
    )

    // --- support_tickets ----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "business_id" uuid,
        "user_id" uuid,
        "created_by" uuid NOT NULL,
        "assigned_to" uuid,
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "category" varchar(20) NOT NULL,
        "severity" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'OPEN',
        "resolution" text,
        "resolved_at" timestamptz,
        CONSTRAINT "pk_support_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "fk_support_tickets_created_by" FOREIGN KEY ("created_by")
          REFERENCES "admin_users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_support_tickets_assigned_to" FOREIGN KEY ("assigned_to")
          REFERENCES "admin_users"("id") ON DELETE SET NULL
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_support_tickets_status" ON "support_tickets" ("status")`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_support_tickets_business" ON "support_tickets" ("business_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_support_tickets_assigned" ON "support_tickets" ("assigned_to")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_audit_logs"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_refresh_tokens"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_users"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_role_permissions"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_roles"`)
  }
}
