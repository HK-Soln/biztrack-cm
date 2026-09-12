import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'

@Injectable()
export class SaleNumberService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Allocate the next sale number `VTE-<YYYYMMDD>-<NNNN>` for a business+date via the atomic
   * `sale_number_sequences` counter.
   *
   * SELF-HEALING against drift: offline-first clients (desktop) generate their OWN numbers and sync
   * them in via createFromSync with the number PRE-SET — those inserts never advance this counter, so
   * a naive `last_sequence + 1` can collide with an already-synced number (unq_sales_business_id_sale_number).
   * We therefore advance to GREATEST(counter, the max sequence already used for this date) + 1, so a
   * server-generated number always clears any synced ones. The `sales` scan is a cheap prefix match on
   * the unique index.
   */
  async generate(businessId: string, saleDate: string, manager?: EntityManager): Promise<string> {
    const executor = manager ?? this.dataSource
    const dateToken = saleDate.replace(/-/g, '')
    const likePrefix = `VTE-${dateToken}-%`
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
      [businessId, saleDate, likePrefix],
    )

    const sequence = String(rows[0]?.last_sequence ?? 1).padStart(4, '0')
    return `VTE-${dateToken}-${sequence}`
  }
}
