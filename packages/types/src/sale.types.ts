import type { Currency } from './business.types'
import type { IsoDateString, ListQuery } from './http.types'
import type { ProductUserSummary } from './product.types'

export enum PaymentMethod {
  CASH = 'CASH',
  MTN_MOMO = 'MTN_MOMO',
  ORANGE_MONEY = 'ORANGE_MONEY',
  CARD = 'CARD',
  SAVINGS = 'SAVINGS',
  MIXED = 'MIXED',
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  VOIDED = 'VOIDED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CANCELLED = 'CANCELLED',
}

/** Channel a sale originated from. Online sales are posted server-side from an order. */
export enum SaleSource {
  IN_STORE = 'IN_STORE',
  ONLINE = 'ONLINE',
}

/** Whether a sale-payment ledger row is money collected or refunded back out. */
export enum SalePaymentKind {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
}

export type SaleCashierSummary = ProductUserSummary

export interface SalePayment {
  id: string
  saleId: string
  businessId: string
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string | null
  savingsAccountId?: string | null
  createdAt: IsoDateString
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  variantId?: string | null
  variantName?: string | null
  serialUnitId?: string | null
  serialNumber?: string | null
  productName: string
  productSku?: string | null
  unitOfMeasure?: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  costPrice?: number | null
  createdAt?: IsoDateString | Date
  updatedAt?: IsoDateString | Date
  isDeleted?: boolean
  /** @deprecated Prefer `lineTotal`. */
  totalPrice: number
}

export interface Sale {
  id: string
  businessId: string
  clientId: string
  cashierId: string
  cashier?: SaleCashierSummary | null
  saleNumber: string
  status: SaleStatus
  subtotal: number
  discountAmount: number
  chargesAmount: number
  taxAmount: number
  totalAmount: number
  amountPaid: number
  creditAmount: number
  changeGiven: number
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  notes?: string | null
  priceDriftWarning: boolean
  saleDate: string
  soldAt: IsoDateString
  syncedAt?: IsoDateString | null
  createdAt: IsoDateString
  updatedAt?: IsoDateString
  voidedAt?: IsoDateString | null
  voidedById?: string | null
  voidReason?: string | null
  currency?: Currency | string | null
  paymentMethod?: PaymentMethod | null
  payments: SalePayment[]
  items: SaleItem[]
  /** @deprecated Prefer `saleNumber`. */
  receiptNumber?: string
  /** @deprecated Prefer `totalAmount`. */
  netAmount?: number
  /** @deprecated Prefer `payments[].mobileMoneyReference`. */
  momoReference?: string | null
}

export interface SaleListItem extends Omit<Sale, 'items' | 'payments' | 'cashier'> {
  cashier?: SaleCashierSummary | null
  itemCount: number
}

export interface CreateSalePaymentRequest {
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string
  // When method is SAVINGS, the customer deposit/savings account the amount is drawn
  // from. The backend deducts the balance and records an outbound usage transaction.
  savingsAccountId?: string | null
}

export interface CreateSaleItemRequest {
  productId: string
  // Required when the product has variants (Phase 3D). Identifies which variant
  // is being sold so stock is deducted from the correct inventory row.
  variantId?: string
  variantName?: string
  // Required when the product is serialised (Phase 3G); the specific unit sold.
  // serialUnitIds carries one or more units for a serialised line (one sale item is
  // created per unit); serialUnitId remains for a single-unit payload.
  serialUnitId?: string
  serialUnitIds?: string[]
  serialNumber?: string
  quantity: number
  unitPrice: number
  discountAmount?: number
  costPrice?: number
}

// A sale-level charge line (e.g. delivery, packaging). The backend persists each line
// and derives the sale's chargesAmount from their sum.
export interface CreateSaleChargeRequest {
  chargeTypeId?: string | null
  name: string
  rateType: 'PERCENT' | 'FIXED'
  rateValue: number
  amount: number
}

// A sale-level discount line. The backend persists each line and derives the sale's
// discountAmount from their sum.
export interface CreateSaleDiscountRequest {
  description: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  rate?: number | null
  amount: number
}

export interface CreateSaleRequest {
  clientId: string
  soldAt: IsoDateString
  customerId?: string
  customerName?: string
  customerPhone?: string
  notes?: string
  // Scalar totals are still accepted (back-compat). When charges/discounts lines are
  // provided the backend computes the totals from the lines and persists the breakdown.
  discountAmount?: number
  chargesAmount?: number
  charges?: CreateSaleChargeRequest[]
  discounts?: CreateSaleDiscountRequest[]
  payments: CreateSalePaymentRequest[]
  items: CreateSaleItemRequest[]
}

export interface VoidSaleRequest {
  reason: string
}

export interface SalesQuery extends ListQuery {
  dateFrom?: string
  dateTo?: string
  status?: SaleStatus
  cashierId?: string
  paymentMethod?: PaymentMethod
  /** Channel filter (online vs in-store). */
  source?: SaleSource
}

export interface DailySalesSummary {
  date: string
  totalSales: number
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMarginPercent: number
  totalDiscounts: number
  cashCollected: number
  mtnMomoCollected: number
  orangeMoneyCollected: number
  cardCollected: number
  creditIssued: number
  creditSales: number
  voidedSales: number
  voidedAmount: number
}

export interface SaleReceiptItem {
  name: string
  qty: number
  unitPrice: number
  total: number
  discountAmount?: number | null
}

export interface SaleReceiptPayment {
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string | null
}

export interface SaleReceiptChargeLine {
  name: string
  amount: number
}

export interface SaleReceiptDiscountLine {
  description: string
  amount: number
}

export interface CashierActivityItem {
  id: string
  saleNumber: string
  type: 'sale' | 'void'
  totalAmount: number
  soldAt: IsoDateString
  voidedAt: IsoDateString | null
  voidReason: string | null
  itemSummary: string
  customerName: string | null
}

export interface CashierShiftSummary {
  cashierId: string
  cashierName: string | null
  date: string
  shiftRevenue: number
  transactionCount: number
  avgOrderValue: number
  voidCount: number
  voidAmount: number
  hourlyCounts: Array<{ hour: number; count: number }>
  topItems: Array<{ productId: string; productName: string; quantity: number }>
  paymentSplit: Array<{ method: PaymentMethod | string; amount: number }>
  recentActivity: CashierActivityItem[]
}

export interface SaleReceipt {
  businessName: string
  businessPhone?: string | null
  businessAddress?: string | null
  saleNumber: string
  soldAt: IsoDateString
  cashierName: string
  customerName?: string | null
  customerPhone?: string | null
  items: SaleReceiptItem[]
  subtotal: number
  discountAmount: number
  chargesAmount: number
  chargeLines?: SaleReceiptChargeLine[]
  discountLines?: SaleReceiptDiscountLine[]
  totalAmount: number
  amountPaid: number
  creditAmount: number
  changeGiven: number
  currency?: Currency | string | null
  payments: SaleReceiptPayment[]
  footer?: string | null
}
