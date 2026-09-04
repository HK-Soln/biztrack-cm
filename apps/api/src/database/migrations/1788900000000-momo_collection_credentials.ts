import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 — switch the MTN provider from the MADAPI enterprise gateway to the MTN MoMo Open API
 * (Collection product). Different credential model: a per-product Collection subscription key
 * (Ocp-Apim-Subscription-Key) plus an API User + API Key used in Basic auth to mint an OAuth token.
 * `target_environment`/`base_url` are only needed in production (sandbox is fixed to
 * https://sandbox.momodeveloper.mtn.com + X-Target-Environment: sandbox). MTN MoMo uses a per-request
 * X-Callback-Url (no dashboard webhook registration), so requires_webhook_registration = false.
 * Idempotent UPDATE.
 */
export class MomoCollectionCredentials1788900000000 implements MigrationInterface {
  name = 'MomoCollectionCredentials1788900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const mtnSchema = JSON.stringify([
      {
        key: 'subscription_key',
        labelEn: 'Collection subscription key',
        labelFr: 'Clé d’abonnement Collection',
        secret: true,
        type: 'password',
      },
      {
        key: 'api_user',
        labelEn: 'API user (UUID)',
        labelFr: 'Utilisateur API (UUID)',
        secret: false,
        type: 'text',
      },
      {
        key: 'api_key',
        labelEn: 'API key',
        labelFr: 'Clé API',
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
        key: 'target_environment',
        labelEn: 'Target environment',
        labelFr: 'Environnement cible',
        secret: false,
        type: 'text',
        optional: true,
        showWhen: { field: 'environment', equals: 'production' },
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
      `UPDATE "payment_providers" SET "credential_schema" = $1::jsonb, "auth_type" = 'OAUTH', "requires_webhook_registration" = false, "updated_at" = now() WHERE "code" = 'MTN'`,
      [mtnSchema],
    )
  }

  public async down(): Promise<void> {
    // Non-destructive catalogue relabel; nothing to revert.
  }
}
