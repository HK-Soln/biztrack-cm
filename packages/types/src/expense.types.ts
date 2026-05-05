import type { Currency } from './business.types'
import type { IsoDateString, ListQuery, PaginatedResult } from './http.types'
import type { ProductUserSummary } from './product.types'
import type { PaymentMethod } from './sale.types'

export type ExpenseRangeGroupBy = 'MONTH' | 'CATEGORY'

export interface ExpenseCategory {
  id: string
  businessId?: string | null
  name: string
  slug: string
  color: string
  icon?: string | null
  sortOrder: number
  isSystem: boolean
  expenseCount?: number
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface Expense {
  id: string
  businessId: string
  categoryId: string
  category: ExpenseCategory | null
  description: string
  amount: number
  currency?: Currency | string | null
  expenseDate: string
  vendor?: string | null
  notes?: string | null
  isRecurring: boolean
  recordedById: string
  recordedBy?: ProductUserSummary | null
  paymentMethod?: PaymentMethod | string | null
  receiptUrl?: string | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
  deletedAt?: IsoDateString | null
  isDeleted?: boolean
}

export interface ExpenseListItem extends Expense {}

export interface ExpenseListResult extends PaginatedResult<ExpenseListItem> {
  totalAmount: number
}

export interface ExpenseMonthlySummary {
  year: number
  month: number
  totalAmount: number
  expenseCount: number
  recurringAmount: number
  oneOffAmount: number
  categoryBreakdown: Record<string, number>
}

export interface ExpenseMonthlyRangeItem {
  year: number
  month: number
  totalAmount: number
}

export interface ExpenseCategoryRangeItem {
  categoryId: string
  name: string
  slug: string
  color: string
  totalAmount: number
  percentage: number
}

export interface ExpensePnlSummary {
  year: number
  month: number
  revenue: number
  costOfGoods: number
  grossProfit: number
  grossMarginPercent: number
  totalExpenses: number
  expenseBreakdown: Record<string, number>
  netProfit: number
  netMarginPercent: number
  isProfitable: boolean
}

export interface ExpensesQuery extends ListQuery {
  dateFrom?: string
  dateTo?: string
  categoryId?: string
  isRecurring?: boolean
}

export interface CreateExpenseRequest {
  categoryId: string
  description: string
  amount: number
  expenseDate: string
  vendor?: string
  notes?: string
  isRecurring?: boolean
  paymentMethod?: PaymentMethod | string
  receiptUrl?: string
}

export interface UpdateExpenseRequest extends Partial<CreateExpenseRequest> {}

export interface CreateExpenseCategoryRequest {
  name: string
  color: string
  icon?: string
  sortOrder?: number
}

export interface UpdateExpenseCategoryRequest extends Partial<CreateExpenseCategoryRequest> {}
