import type { DatabaseService } from '@biztrack/electron-core'
import type { ChargeType } from '../../shared/ipc'

interface ChargeTypeRow {
  id: string
  business_id: string | null
  name: string
  description: string | null
  rate_type: string | null
  default_value: number
  is_active: number
  is_system: number
}

/**
 * Read-only access to the charge_types catalog (system + this business's own types):
 * tax (TVA), transport, packaging, etc. Used to populate the "add charge" library when
 * settling a goods receipt. Catalog management (CRUD) is not exposed yet — receipts may
 * still add one-off custom charges with no chargeTypeId.
 */
export class ChargesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
  ) {}

  /** Active charge types: system (business_id NULL) + this business's, system first. */
  listActive(): ChargeType[] {
    const businessId = this.getBusinessId()
    const rows = this.db.query<ChargeTypeRow>(
      `SELECT id, business_id, name, description, rate_type, default_value, is_active, is_system
       FROM charge_types
       WHERE is_active = 1 AND (business_id IS NULL OR business_id = ?)
       ORDER BY is_system DESC, sort_order ASC, name ASC`,
      [businessId],
    )
    return rows.map(toChargeType)
  }
}

function toChargeType(row: ChargeTypeRow): ChargeType {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description,
    rateType: row.rate_type === 'PERCENT' ? 'PERCENT' : 'FIXED',
    defaultValue: row.default_value ?? 0,
    isActive: row.is_active === 1,
    isSystem: row.is_system === 1,
    createdAt: '',
    updatedAt: '',
  } as ChargeType
}
