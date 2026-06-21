import { MigrationInterface, QueryRunner } from 'typeorm'

/** Storefront appearance, catalog binding, SEO/social and the draft→published lifecycle
 * for online_stores (design-store-config + GitHub issue #91). */
export class OnlineStoreConfig1782200000000 implements MigrationInterface {
  name = 'OnlineStoreConfig1782200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const add = (sql: string) => queryRunner.query(`ALTER TABLE "online_stores" ADD COLUMN IF NOT EXISTS ${sql}`)
    await add(`"layout_template" character varying(20) NOT NULL DEFAULT 'classic'`)
    await add(`"theme_id" character varying(20) NOT NULL DEFAULT 'a'`)
    await add(`"appearance" character varying(10) NOT NULL DEFAULT 'light'`)
    await add(`"catalog_binding" character varying(10) NOT NULL DEFAULT 'snapshot'`)
    await add(`"show_low_stock_badges" boolean NOT NULL DEFAULT false`)
    await add(`"seo_title" character varying(120)`)
    await add(`"seo_description" character varying(300)`)
    await add(`"og_image_url" text`)
    await add(`"robots_index" boolean NOT NULL DEFAULT true`)
    await add(`"social_instagram" character varying(200)`)
    await add(`"social_facebook" character varying(200)`)
    await add(`"social_tiktok" character varying(200)`)
    await add(`"status" character varying(12) NOT NULL DEFAULT 'draft'`)
    await add(`"published_at" timestamptz`)
    await add(`"has_unpublished_changes" boolean NOT NULL DEFAULT true`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drop = (col: string) => queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "${col}"`)
    for (const c of [
      'layout_template', 'theme_id', 'appearance', 'catalog_binding', 'show_low_stock_badges',
      'seo_title', 'seo_description', 'og_image_url', 'robots_index',
      'social_instagram', 'social_facebook', 'social_tiktok',
      'status', 'published_at', 'has_unpublished_changes',
    ]) await drop(c)
  }
}
