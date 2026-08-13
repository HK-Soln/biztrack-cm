export enum ChargeRateType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  /** Cashier typed an agreed (bargained) price; amount = (listed − charged) × qty. */
  OVERRIDE = 'OVERRIDE',
  /** Rounding down to a whole/convenient amount (cadeau). */
  ROUNDING = 'ROUNDING',
  /** Price cut for damaged/imperfect stock. */
  DAMAGE = 'DAMAGE',
  /** Staff purchase discount. STAFF_PURCHASE (not STAFF) to avoid the role collision. */
  STAFF_PURCHASE = 'STAFF_PURCHASE',
}

/** String form of {@link DiscountType} for request/sync payloads (the DB column is a
 * free-form varchar; keep the PERCENTAGE/FIXED_AMOUNT spellings). */
export type SaleDiscountTypeValue =
  | 'PERCENTAGE'
  | 'FIXED_AMOUNT'
  | 'OVERRIDE'
  | 'ROUNDING'
  | 'DAMAGE'
  | 'STAFF_PURCHASE'

/** Why a discount was given. Business-editable later; a fixed enum for now. */
export enum DiscountReasonCode {
  NEGOTIATED = 'NEGOTIATED',
  REGULAR_CUSTOMER = 'REGULAR_CUSTOMER',
  BULK = 'BULK',
  DAMAGED = 'DAMAGED',
  NEAR_EXPIRY = 'NEAR_EXPIRY',
  STAFF_PURCHASE = 'STAFF_PURCHASE',
  ROUNDING = 'ROUNDING',
  OTHER = 'OTHER',
}

export interface SaleDiscount {
  id: string
  saleId: string
  saleItemId?: string | null
  businessId: string
  description: string
  discountType: DiscountType
  rate?: number | null
  amount: number
  createdAt: string
}

export interface CreateSaleDiscountInput {
  description: string
  discountType: DiscountType
  rate?: number | null
  amount: number
}

export interface ChargeType {
  id: string
  businessId: string | null
  name: string
  description?: string | null
  rateType: ChargeRateType
  defaultValue: number
  isActive: boolean
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export interface SaleCharge {
  id: string
  saleId: string
  businessId: string
  chargeTypeId?: string | null
  name: string
  rateType: ChargeRateType
  rateValue: number
  amount: number
  createdAt: string
}

export interface CreateSaleChargeInput {
  chargeTypeId?: string | null
  name: string
  rateType: ChargeRateType
  rateValue: number
  amount: number
}
