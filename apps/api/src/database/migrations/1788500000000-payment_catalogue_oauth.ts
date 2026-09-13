import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 — align the seeded catalogue with the real provider auth models:
 *  - MTN uses OAuth 2.0 client-credentials (api.mtn.com/v1/oauth/access_token): the merchant supplies
 *    a Consumer Key + Consumer Secret; the adapter exchanges them for a short-lived Bearer token.
 *  - Stripe should be connected with a RESTRICTED secret key (rk_…), not a full secret key (§10).
 * Idempotent UPDATEs, so this is safe whether or not the catalogue was already seeded.
 */
export class PaymentCatalogueOauth1788500000000 implements MigrationInterface {
  name = 'PaymentCatalogueOauth1788500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
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
    ])
    await queryRunner.query(
      `UPDATE "payment_providers" SET "auth_type" = 'OAUTH', "credential_schema" = $1::jsonb, "updated_at" = now() WHERE "code" = 'MTN'`,
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
        key: 'webhook_signing_secret',
        labelEn: 'Webhook signing secret',
        labelFr: 'Secret de signature webhook',
        secret: true,
        type: 'password',
      },
    ])
    await queryRunner.query(
      `UPDATE "payment_providers" SET "credential_schema" = $1::jsonb, "updated_at" = now() WHERE "code" = 'STRIPE'`,
      [stripeSchema],
    )
  }

  public async down(): Promise<void> {
    // Non-destructive catalogue relabel; nothing to revert.
  }
}
