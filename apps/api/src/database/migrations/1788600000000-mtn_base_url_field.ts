import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 — MTN OAuth uses the global host `api.mtn.com` for sandbox; production is a per-tenant host
 * MTN issues after onboarding. Add an optional `base_url` credential field, shown+required only when
 * environment = production; otherwise the adapter defaults to https://api.mtn.com. Idempotent UPDATE.
 */
export class MtnBaseUrlField1788600000000 implements MigrationInterface {
  name = 'MtnBaseUrlField1788600000000'

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
      {
        key: 'base_url',
        labelEn: 'Production base URL',
        labelFr: 'URL de base (production)',
        secret: false,
        type: 'url',
        showWhen: { field: 'environment', equals: 'production' },
      },
    ])
    await queryRunner.query(
      `UPDATE "payment_providers" SET "credential_schema" = $1::jsonb, "updated_at" = now() WHERE "code" = 'MTN'`,
      [mtnSchema],
    )
  }

  public async down(): Promise<void> {
    // Non-destructive catalogue relabel; nothing to revert.
  }
}
