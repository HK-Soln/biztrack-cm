import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * One-time repair of the denormalised `products.has_variants` flag, which had drifted out
 * of sync: products created on the desktop (which has no such flag — it tests
 * EXISTS(variants)) landed on the API with `has_variants = false` even when they had
 * variant rows, skewing stock/price derivation that keyed on the flag. Going forward the
 * sync apply re-derives it on every variant change; this fixes existing rows.
 */
export class RepairHasVariants1782700000000 implements MigrationInterface {
  name = 'RepairHasVariants1782700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE products p SET has_variants = EXISTS (
         SELECT 1 FROM product_variants pv
         WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
       )
       WHERE has_variants <> EXISTS (
         SELECT 1 FROM product_variants pv
         WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
       )`,
    )
  }

  public async down(): Promise<void> {
    // Data repair only — nothing to revert.
  }
}
