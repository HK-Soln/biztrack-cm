import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 build-order 1 — the payment provider catalogue. Two reference tables plus seed rows for
 * the first two providers (Stripe = card, MTN = MoMo). Reference data is seeded IN the migration so
 * it exists in every environment (unlike the dev-only seed scripts). Adding a provider later is an
 * INSERT; only a genuinely new PaymentMethod costs code.
 *
 * Stripe does not onboard Cameroon-registered businesses for payouts, so its CARD/CM capability is
 * seeded is_active = false (catalogued, not available in CM production; a dev may flip it to test
 * the pipeline against Stripe sandbox). MTN MoMo is the CM production target and is active.
 */
export class PaymentProviderCatalogue1788000000000 implements MigrationInterface {
  name = 'PaymentProviderCatalogue1788000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_providers" (
        "code"              text PRIMARY KEY,
        "name"              text NOT NULL,
        "auth_type"         varchar(16) NOT NULL,
        "credential_schema" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_active"         boolean NOT NULL DEFAULT true,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_provider_capabilities" (
        "provider_code"          text NOT NULL,
        "payment_method"         varchar(20) NOT NULL,
        "country_code"           varchar(2) NOT NULL,
        "supports_payment_links" boolean NOT NULL DEFAULT false,
        "supports_ussd_push"     boolean NOT NULL DEFAULT false,
        "supports_refunds"       boolean NOT NULL DEFAULT false,
        "supports_webhooks"      boolean NOT NULL DEFAULT false,
        "is_active"              boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_payment_provider_capabilities"
          PRIMARY KEY ("provider_code", "payment_method", "country_code"),
        CONSTRAINT "fk_payment_provider_capabilities_provider"
          FOREIGN KEY ("provider_code") REFERENCES "payment_providers"("code") ON DELETE CASCADE
      )
    `)

    // --- Seed providers (idempotent) ---
    const stripeSchema = JSON.stringify([
      {
        key: 'secret_key',
        labelEn: 'Secret key',
        labelFr: 'Clé secrète',
        secret: true,
        type: 'password',
      },
      {
        key: 'publishable_key',
        labelEn: 'Publishable key',
        labelFr: 'Clé publiable',
        secret: false,
        type: 'text',
      },
      {
        key: 'webhook_signing_secret',
        labelEn: 'Webhook signing secret',
        labelFr: 'Secret de signature webhook',
        secret: true,
        type: 'password',
      },
    ])
    const mtnSchema = JSON.stringify([
      {
        key: 'subscription_key',
        labelEn: 'Subscription key',
        labelFr: 'Clé de souscription',
        secret: true,
        type: 'password',
      },
      {
        key: 'api_user',
        labelEn: 'API user',
        labelFr: 'Utilisateur API',
        secret: false,
        type: 'text',
      },
      { key: 'api_key', labelEn: 'API key', labelFr: 'Clé API', secret: true, type: 'password' },
      {
        key: 'environment',
        labelEn: 'Environment',
        labelFr: 'Environnement',
        secret: false,
        type: 'select',
        options: ['sandbox', 'production'],
      },
    ])

    await queryRunner.query(
      `INSERT INTO "payment_providers" (code, name, auth_type, credential_schema, is_active)
       VALUES
         ('STRIPE', 'Stripe', 'API_KEY', $1::jsonb, true),
         ('MTN', 'MTN Mobile Money', 'API_KEY', $2::jsonb, true)
       ON CONFLICT (code) DO NOTHING`,
      [stripeSchema, mtnSchema],
    )

    // --- Seed capabilities (idempotent) ---
    // MTN MoMo — CM production target: request-to-pay (USSD push) + webhooks + refunds.
    // Stripe CARD — catalogued for CM but INACTIVE (not available to CM merchants for payout).
    await queryRunner.query(`
      INSERT INTO "payment_provider_capabilities"
        (provider_code, payment_method, country_code,
         supports_payment_links, supports_ussd_push, supports_refunds, supports_webhooks, is_active)
      VALUES
        ('MTN',    'MTN_MOMO', 'CM', false, true,  true, true, true),
        ('STRIPE', 'CARD',     'CM', true,  false, true, true, false)
      ON CONFLICT (provider_code, payment_method, country_code) DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_provider_capabilities"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_providers"`)
  }
}
