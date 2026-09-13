// Spec 10 ① — Other Income: non-trading income (general payment-link settlements, deposit-cancellation
// charges, manual entries) that feeds the income statement's "other income" line.

/** How an other-income entry was booked. */
export type OtherIncomeSource = 'MANUAL' | 'PAYMENT_LINK' | 'DEPOSIT_CHARGE'

/** A category for other income (mirrors expense categories). System categories (businessId null) are
 *  shared across every business; a business may add its own. */
export interface IncomeCategoryView {
  id: string
  businessId: string | null
  name: string
  slug: string
  color: string
  icon?: string | null
  sortOrder: number
}

export interface OtherIncomeView {
  id: string
  categoryId: string
  categoryName: string
  categoryColor?: string | null
  description: string
  amount: number
  currency: string
  paymentMethod?: string | null
  reference?: string | null
  source: OtherIncomeSource
  note?: string | null
  date: string
  createdAt: string
}

/** Record a manual other-income entry (merchant, authed). Amount in major units (XAF). */
export interface CreateOtherIncomeRequest {
  categoryId: string
  description: string
  amount: number
  paymentMethod?: string
  note?: string
  /** Effective date (ISO date, YYYY-MM-DD); defaults to today. */
  date?: string
}

export interface ListOtherIncomeQuery {
  page?: number
  limit?: number
  categoryId?: string
  from?: string
  to?: string
}

export interface OtherIncomeListResult {
  items: OtherIncomeView[]
  total: number
  page: number
  limit: number
  totalPages: number
  /** Sum of `amount` over the whole filtered set (not just the page). */
  totalAmount: number
}

/** Total other income over a date range — the income statement's "other income" line. */
export interface OtherIncomeSummary {
  total: number
  currency: string
}
