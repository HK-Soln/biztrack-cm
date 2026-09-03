import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 — webhook setup + MTN base_url optional.
 *
 * Adds:
 *  - `payment_providers.requires_webhook_registration` — when true, the merchant MUST register the
 *    webhook URL (and supply any webhook credential) before a method can be routed to the provider.
 *    Stripe = true (no per-request callback); MTN = false (accepts a per-request callback URL, so
 *    webhook setup is offered but optional).
 *  - `business_payment_providers.webhook_configured_at` — set when the merchant completes webhook
 *    setup (step 2). Drives the `webhookConfigured` view flag and the routing gate.
 *
 * Catalogue relabels (idempotent UPDATEs):
 *  - MTN: `base_url` becomes optional (shown for production, falls back to https://api.mtn.com when
 *    blank instead of hard-blocking); requires_webhook_registration = false.
 *  - Stripe: `webhook_signing_secret` is marked `webhook: true` so it is collected in step 2
 *    (configure-webhook), not required to connect; requires_webhook_registration = true.
 */
export class PaymentWebhookSetup1788700000000 implements MigrationInterface {
  name = 'PaymentWebhookSetup1788700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_providers" ADD COLUMN IF NOT EXISTS "requires_webhook_registration" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "business_payment_providers" ADD COLUMN IF NOT EXISTS "webhook_configured_at" timestamptz`,
    )

    const mtnSchema = JSON.stringify([
      {
        key: 'consumer_key',
        labelEn: 'Consumer key',
        labelFr: 'Clé consommateur',
        secret: false,
        type: 'text',
      },
      {
        key: 'consumer_secret',
        labelEn: 'Consumer secret',
        labelFr: 'Secret consommateur',
        secret: true,
        type: 'password',
      },
      {
        key: 'environment',
        labelEn: 'Environment',
        labelFr: 'Environnement',
        secret: false,
        type: 'select',
        options: ['sandbox', 'production'],
      },
      {
        key: 'base_url',
        labelEn: 'Production base URL',
        labelFr: 'URL de base (production)',
        secret: false,
        type: 'url',
        optional: true,
        showWhen: { field: 'environment', equals: 'production' },
      },
    ])
    await queryRunner.query(
      `UPDATE "payment_providers" SET "credential_schema" = $1::jsonb, "requires_webhook_registration" = false, "updated_at" = now() WHERE "code" = 'MTN'`,
      [mtnSchema],
    )

    const stripeSchema = JSON.stringify([
      {
        key: 'secret_key',
        labelEn: 'Restricted secret key (rk_…)',
        labelFr: 'Clé secrète restreinte (rk_…)',
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
        // `webhook: true` skips it at connect (step 1); required at configure-webhook (step 2).
        key: 'webhook_signing_secret',
        labelEn: 'Webhook signing secret',
        labelFr: 'Secret de signature webhook',
        secret: true,
        type: 'password',
        webhook: true,
      },
    ])
    await queryRunner.query(
      `UPDATE "payment_providers" SET "credential_schema" = $1::jsonb, "requires_webhook_registration" = true, "updated_at" = now() WHERE "code" = 'STRIPE'`,
      [stripeSchema],
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "business_payment_providers" DROP COLUMN IF EXISTS "webhook_configured_at"`,
    )
    await queryRunner.query(
      `ALTER TABLE "payment_providers" DROP COLUMN IF EXISTS "requires_webhook_registration"`,
    )
  }
}
