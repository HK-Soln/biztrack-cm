import type { IsoDateString } from './http.types'

export interface DepositTaggedProduct {
  productId: string
  productName: string
}

export type DepositTransactionType = 'deposit' | 'refund' | 'sale' | 'voided_sale'
export type DepositTransactionDirection = 'inbound' | 'outbound'

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
  initialDeposit: CreateDepositTransactionInput
}

export interface DepositsQuery {
  page?: number
  limit?: number
  search?: string
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
