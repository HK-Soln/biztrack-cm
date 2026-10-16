import { MigrationInterface, QueryRunner } from 'typeorm'
import { contactNameKey } from '@biztrack/domain'

/**
 * Ruling R16 (docs/design/domain-package.md): a contact's name is unique in its business,
 * compared by its slug (`contactNameKey`, so "Kemi Stores" and "kemi-stores" are the same).
 *
 * Adds `contacts.name_key` and a unique index on (business_id, name_key). Contacts that
 * already share a name keep their names; the second and later ones get a numbered key
 * (`kemi-stores-2`, …) so the index can be built. New contacts must use a free name.
 */
export class ContactNameKey1790700000000 implements MigrationInterface {
  name = 'ContactNameKey1790700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "name_key" character varying(220)`,
    )
    const rows = (await queryRunner.query(
      `SELECT id, business_id, name FROM contacts ORDER BY business_id, created_at, id`,
    )) as Array<{ id: string; business_id: string; name: string }>

    const taken = new Map<string, Set<string>>()
    let renumbered = 0
    for (const row of rows) {
      const keys = taken.get(row.business_id) ?? new Set<string>()
      taken.set(row.business_id, keys)
      const base = contactNameKey(row.name) || 'contact'
      let key = base
      for (let n = 2; keys.has(key); n += 1) key = `${base}-${n}`
      if (key !== base) renumbered += 1
      keys.add(key)
      await queryRunner.query(`UPDATE contacts SET name_key = $1 WHERE id = $2`, [key, row.id])
    }

    await queryRunner.query(`ALTER TABLE "contacts" ALTER COLUMN "name_key" SET NOT NULL`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_contacts_business_name_key"
         ON "contacts" ("business_id", "name_key")`,
    )
    // eslint-disable-next-line no-console -- one-time change: the deploy log is its report
    console.log(
      `[contact_name_key] keyed ${rows.length} contact(s); ${renumbered} shared a name and were numbered`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_contacts_business_name_key"`)
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "name_key"`)
  }
}
