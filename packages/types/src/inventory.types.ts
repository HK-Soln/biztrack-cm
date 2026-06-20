import type { IsoDateString, ListQuery } from './http.types'
import type { ProductCategory, ProductUserSummary, UnitOfMeasure } from './product.types'
import type { PaymentMethod } from './sale.types'

export enum InventoryMovementType {
  SALE = 'SALE',
  RESTOCK_IN = 'RESTOCK_IN',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  VOID_REVERSAL = 'VOID_REVERSAL',
  OPENING_STOCK = 'OPENING_STOCK',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export enum StockAdjustmentType {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
  SET = 'SET',
}

export interface InventoryListItem {
  productId: string
  productName: string | null
  sku: string | null
  barcode: string | null
  primaryImageUrl?: string | null
  categoryName: string | null
  unitAbbreviation: string | null
  quantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  isLowStock: boolean
  lastRestockAt: IsoDateString | null
}

export interface InventoryAlert {
  productId: string
  productName: string | null
  sku: string | null
  primaryImageUrl?: string | null
  categoryName: string | null
  currentQuantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  shortfall: number
}

export interface InventoryMovementPerformer extends ProductUserSummary {}

export interface InventoryMovement {
  id: string
  businessId: string
  productId: string
  type: InventoryMovementType
  quantityChange: number
  quantityBefore: number
  quantityAfter: number
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
  performedBy?: InventoryMovementPerformer | null
  /** @deprecated Prefer `performedBy` */
  performedById?: string | null
  referenceLabel?: string | null
  createdAt: IsoDateString
}

export interface InventoryProductSummary {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  slug: string
  imageUrl?: string | null
  category?: ProductCategory | null
  unitOfMeasure?: UnitOfMeasure | null
}

export interface InventoryMovementTrendPoint {
  date: string
  stockIn: number
  stockOut: number
}

export interface InventoryBinSummary {
  openingStock: number
  totalRestocked: number
  totalSold: number
  totalAdjusted: number
  currentBalance: number
  lastRestockAt: IsoDateString | null
  lastRestockQuantity: number | null
  lastRestockReferenceLabel?: string | null
  lastRestockSourceName?: string | null
  movementWindowDays: number
  trend: InventoryMovementTrendPoint[]
}

export interface InventoryDetail {
  id: string
  businessId: string
  productId: string
  quantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  lastRestockAt: IsoDateString | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
  product: InventoryProductSummary
  movements: InventoryMovement[]
  binSummary?: InventoryBinSummary | null
}

export interface InventoryQuery extends ListQuery {
  categoryId?: string
  lowStockOnly?: boolean
}

export interface InventoryAlertsQuery extends ListQuery {}

export interface InventoryMovementsQuery extends ListQuery {
  productId?: string
  type?: InventoryMovementType
  dateFrom?: IsoDateString
  dateTo?: IsoDateString
}

export interface SetInventoryThresholdRequest {
  lowStockThreshold?: number | null
  reorderPoint?: number | null
}

export interface AdjustInventoryRequest {
  type: StockAdjustmentType
  quantity: number
  notes: string
}

export interface RestockItemRequest {
  productId: string
  // For serialised products (Phase 3G), provide serialNumbers instead of quantity.
  quantity?: number
  unitCost?: number
  variantId?: string
  serialNumbers?: string[]
  warrantyMonths?: number
}

export interface RestockPaymentRequest {
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string | null
}

/** A supplier charge applied at receive time (tax, transport, packaging…). Mirrors
 * the sale charge model; references the shared `charge_types` catalog when picked
 * from it, or carries `chargeTypeId: null` for a one-off custom charge. */
export interface RestockChargeLineRequest {
  id: string
  chargeTypeId?: string | null
  name: string
  rateType: 'PERCENT' | 'FIXED'
  rateValue: number
  amount: number
}

/** A supplier discount applied at receive time (remise). Mirrors the sale discount model. */
export interface RestockDiscountLineRequest {
  id: string
  description: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  rate?: number | null
  amount: number
}

export interface RestockRequest {
  referenceNumber?: string
  supplierId?: string
  supplierName?: string
  /** Goods subtotal — Σ(qty × unitCost). Feeds inventory valuation. */
  subtotalAmount?: number
  /** Σ of discount lines. */
  discountAmount?: number
  /** Σ of charge lines. */
  chargesAmount?: number
  /** Invoice total = subtotal − discounts + charges. */
  totalAmount?: number
  totalCost?: number
  notes?: string
  payments?: RestockPaymentRequest[]
  charges?: RestockChargeLineRequest[]
  discounts?: RestockDiscountLineRequest[]
  /** Supplier invoice (audit proof). File required when a credit balance remains. */
  invoiceNumber?: string | null
  invoiceDate?: IsoDateString | null
  invoiceFileUrl?: string | null
  items: RestockItemRequest[]
}

export interface RestockProcessedItem {
  productId: string
  quantity: number
  newQuantity: number
}

export interface RestockResponse {
  id: string
  businessId: string
  referenceNumber?: string | null
  supplierId?: string | null
  supplierName?: string | null
  subtotalAmount?: number | null
  discountAmount?: number | null
  chargesAmount?: number | null
  totalAmount: number
  amountPaid: number
  creditAmount: number
  totalCost?: number | null
  notes?: string | null
  invoiceNumber?: string | null
  invoiceDate?: IsoDateString | null
  invoiceFileUrl?: string | null
  performedById?: string | null
  createdAt: IsoDateString
  payments?: RestockPaymentRequest[]
  charges?: RestockChargeLineRequest[]
  discounts?: RestockDiscountLineRequest[]
  items: RestockProcessedItem[]
}
