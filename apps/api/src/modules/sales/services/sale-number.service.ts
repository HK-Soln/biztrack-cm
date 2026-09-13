import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'

@Injectable()
export class SaleNumberService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Allocate the next sale number `<prefix><YYYYMMDD>-<NNNN>` for a business+date via the atomic
   * `sale_number_sequences` counter. The prefix is the business's configurable `receipt_number_prefix`
   * (default `VTE-`) — matching the desktop generator; only the prefix varies, the date + sequence keep
   * every number unique.
   *
   * SELF-HEALING against drift: offline-first clients (desktop) generate their OWN numbers — now
   * `<prefix><date>-<TAG>-<seq>` — and sync them in via createFromSync with the number PRE-SET, which
   * never advances this counter. So a naive `last_sequence + 1` can collide. We advance to
   * GREATEST(counter, max trailing sequence already used for this DATE, across any prefix/tag) + 1 so a
   * server-generated number always clears synced ones. The scan matches by date token (prefix-agnostic)
   * and reads the trailing digits, so it stays correct across a prefix change and the desktop device tag.
   */
  async generate(businessId: string, saleDate: string, manager?: EntityManager): Promise<string> {
    const executor = manager ?? this.dataSource
    const dateToken = saleDate.replace(/-/g, '')
    // Prefix-agnostic, date-scoped match: every number contains `<date>-` regardless of prefix/tag.
    const likeDate = `%${dateToken}-%`
    const rows = await executor.query(
      `
        INSERT INTO sale_number_sequences (business_id, sale_date, last_sequence)
        VALUES (
          $1, $2,
          COALESCE((
            SELECT MAX((substring(sale_number from '[0-9]+$'))::int)
            FROM sales WHERE business_id = $1 AND sale_number LIKE $3
          ), 0) + 1
        )
        ON CONFLICT (business_id, sale_date)
        DO UPDATE SET last_sequence = GREATEST(
          sale_number_sequences.last_sequence,
          COALESCE((
            SELECT MAX((substring(sale_number from '[0-9]+$'))::int)
            FROM sales WHERE business_id = $1 AND sale_number LIKE $3
          ), 0)
        ) + 1
        RETURNING last_sequence
      `,
      [businessId, saleDate, likeDate],
    )

    const prefixRow = await executor.query(
      `SELECT receipt_number_prefix AS prefix FROM businesses WHERE id = $1`,
      [businessId],
    )
    const prefix = (prefixRow[0]?.prefix as string | null)?.trim() || 'VTE-'
    const sequence = String(rows[0]?.last_sequence ?? 1).padStart(4, '0')
    return `${prefix}${dateToken}-${sequence}`
  }
}
