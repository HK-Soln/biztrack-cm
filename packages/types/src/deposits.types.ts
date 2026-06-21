import type { IsoDateString } from './http.types'

export interface DepositTaggedProduct {
  productId: string
  productName: string
}

export type DepositTransactionType = 'deposit' | 'refund' | 'sale' | 'voided_sale' | 'transfer_in' | 'transfer_out'
export type DepositTransactionDirection = 'inbound' | 'outbound'

/** A deposit session is OPEN (active) until it's CLOSED with a balance of zero. */
export type DepositStatus = 'OPEN' | 'CLOSED'

/**
 * How a session ended (set on close). Explicit so the UI is unambiguous:
 * - COLLECTED              — goods collected; deposit fully spent (no leftover)
 * - COLLECTED_REFUNDED     — goods collected; leftover refunded to the customer
 * - COLLECTED_TRANSFERRED  — goods collected; leftover transferred to a new session
 * - REFUNDED               — no goods collected; deposit refunded (cancellation)
 */
export type DepositOutcome = 'COLLECTED' | 'COLLECTED_REFUNDED' | 'COLLECTED_TRANSFERRED' | 'REFUNDED'

// Backwards-compat aliases
export type SavingsTransactionType = DepositTransactionType
export type SavingsTransactionDirection = DepositTransactionDirection

export interface CustomerDeposit {
  id: string
  businessId: string
  customerId: string
  customerName?: string | null
  customerPhone?: string | null
  accountNumber: string
  balance: number
  totalDeposited: number
  totalRefunded: number
  totalUsed: number
  totalTransferred: number
  /** Session lifecycle. */
  status: DepositStatus
  outcome?: DepositOutcome | null
  closedAt?: IsoDateString | null
  closedById?: string | null
  /** When the leftover was transferred, the new session it went to. */
  transferredToId?: string | null
  /** Number of goods-collection sales drawn against this session (drives transfer eligibility). */
  salesCount?: number
  taggedProducts?: DepositTaggedProduct[] | null
  isDeleted?: boolean
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface DepositTransaction {
  id: string
  savingsId: string
  businessId: string
  type: DepositTransactionType
  direction: DepositTransactionDirection
  amount: number
  method?: string | null
  mobileMoneyReference?: string | null
  saleId?: string | null
  notes?: string | null
  recordedById?: string | null
  occurredAt: IsoDateString
  createdAt: IsoDateString
  isDeleted?: boolean
}

export interface DepositStatementEntry {
  id: string
  type: DepositTransactionType
  direction: DepositTransactionDirection
  amount: number
  method?: string | null
  mobileMoneyReference?: string | null
  saleId?: string | null
  notes?: string | null
  occurredAt: IsoDateString
  createdAt: IsoDateString
  runningBalance: number
}

export interface DepositStatement {
  account: CustomerDeposit
  entries: DepositStatementEntry[]
}

/** A full deposit-session report (PDF) — header, summary, tagged items, full statement. */
export interface DepositReportEntry {
  occurredAt: IsoDateString
  type: DepositTransactionType
  direction: DepositTransactionDirection
  amount: number
  method?: string | null
  notes?: string | null
  runningBalance: number
}
export interface DepositReport {
  businessName: string
  businessPhone?: string | null
  businessAddress?: string | null
  sessionRef: string
  createdAt: IsoDateString
  status: DepositStatus
  outcome?: DepositOutcome | null
  closedAt?: IsoDateString | null
  customerName?: string | null
  customerPhone?: string | null
  totalDeposited: number
  totalUsed: number
  totalRefunded: number
  totalTransferred: number
  balance: number
  currency?: string | null
  taggedProducts: DepositTaggedProduct[]
  entries: DepositReportEntry[]
}

/** A shareable receipt for a single deposit/refund transaction (print / PDF / send). */
export interface DepositReceipt {
  businessName: string
  businessPhone?: string | null
  businessAddress?: string | null
  /** Human reference for this receipt (session + short transaction id). */
  receiptNumber: string
  sessionRef: string
  occurredAt: IsoDateString
  cashierName?: string | null
  customerName?: string | null
  customerPhone?: string | null
  /** Whether this records a deposit (money in) or a refund (money out). */
  kind: 'deposit' | 'refund'
  amount: number
  method?: string | null
  balanceAfter: number
  totalDeposited: number
  currency?: string | null
  footer?: string | null
}

export interface CreateDepositTransactionInput {
  type: DepositTransactionType
  direction: DepositTransactionDirection
  amount: number
  method?: string | null
  mobileMoneyReference?: string | null
  saleId?: string | null
  notes?: string | null
  recordedById?: string | null
}

export interface CreateDepositInput {
  customerId: string
  customerName?: string | null
  customerPhone?: string | null
  taggedProducts?: DepositTaggedProduct[] | null
  /** Optional opening deposit; a session may also start empty and take payments later. */
  initialDeposit?: AddDepositPaymentInput | null
}

/** Add a deposit (top-up) to an open session. */
export interface AddDepositPaymentInput {
  amount: number
  method?: string | null
  mobileMoneyReference?: string | null
  notes?: string | null
}

/** How to settle the leftover balance when closing a session. */
export type DepositCloseSettlement = 'NONE' | 'REFUND' | 'TRANSFER'

export interface CloseDepositInput {
  settlement: DepositCloseSettlement
  /** Required for REFUND (how the money was returned). */
  method?: string | null
  mobileMoneyReference?: string | null
  notes?: string | null
}

export interface DepositsQuery {
  page?: number
  limit?: number
  search?: string
  status?: DepositStatus
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

// ---------------------------------------------------------------------------
// Backwards-compat aliases — keep until all consumers are migrated
// ---------------------------------------------------------------------------
export type SavingsAccount = CustomerDeposit
export type SavingsTransaction = DepositTransaction
export type SavingsStatementEntry = DepositStatementEntry
export type SavingsStatement = DepositStatement
export type CreateSavingsTransactionInput = CreateDepositTransactionInput
export type CreateSavingsInput = CreateDepositInput
export type SavingsQuery = DepositsQuery
export type SavingsTaggedProduct = DepositTaggedProduct
