import type {
  Expense,
  ExpenseCategory,
  ExpenseCategoryRangeItem,
  ExpenseListItem,
  ExpenseMonthlyRangeItem,
  ExpenseMonthlySummary,
  ExpensePnlSummary,
} from '@biztrack/types'
import { Expense as ExpenseEntity } from '@/entities/expense.entity'
import { ExpenseCategory as ExpenseCategoryEntity } from '@/entities/expense-category.entity'
import { MonthlyExpenseSummary as MonthlyExpenseSummaryEntity } from '@/entities/monthly-expense-summary.entity'
import { toIsoString } from '@/common/http/serialization'

type ExpenseDetailModel = ExpenseEntity & {
  category?: ExpenseCategoryEntity | null
  recordedBy?: { id: string; name: string } | null
}

type ExpenseCategoryModel = ExpenseCategoryEntity & {
  expenseCount?: number
}

export class ExpenseRecordedByDto {
  id!: string
  name!: string

  static fromModel(model?: { id: string; name: string } | null) {
    if (!model) return null

    const dto = new ExpenseRecordedByDto()
    dto.id = model.id
    dto.name = model.name
    return dto
  }
}

export class ExpenseCategoryDto implements ExpenseCategory {
  id!: string
  businessId?: string | null
  name!: string
  slug!: string
  color!: string
  icon?: string | null
  sortOrder!: number
  isSystem!: boolean
  expenseCount?: number
  createdAt!: string
  updatedAt!: string

  static fromEntity(entity?: ExpenseCategoryModel | null): ExpenseCategoryDto | null {
    if (!entity) return null

    const dto = new ExpenseCategoryDto()
    dto.id = entity.id
    dto.businessId = entity.businessId ?? null
    dto.name = entity.name
    dto.slug = entity.slug
    dto.color = entity.color
    dto.icon = entity.icon ?? null
    dto.sortOrder = entity.sortOrder
    dto.isSystem = !entity.businessId
    dto.expenseCount = entity.expenseCount
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    dto.updatedAt = toIsoString(entity.updatedAt) ?? ''
    return dto
  }
}

export class ExpenseResponseDto implements Expense {
  id!: string
  businessId!: string
  categoryId!: string
  category!: ExpenseCategoryDto | null
  description!: string
  amount!: number
  currency?: string | null
  expenseDate!: string
  vendor?: string | null
  notes?: string | null
  isRecurring!: boolean
  status!: string
  recordedById!: string
  recordedBy?: ExpenseRecordedByDto | null
  paymentMethod?: string | null
  receiptUrl?: string | null
  createdAt!: string
  updatedAt!: string
  deletedAt?: string | null
  isDeleted?: boolean

  static fromEntity(entity?: ExpenseDetailModel | null): ExpenseResponseDto | null {
    if (!entity) return null

    const dto = new ExpenseResponseDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.categoryId = entity.categoryId
    dto.category = ExpenseCategoryDto.fromEntity(entity.category as ExpenseCategoryModel)
    dto.description = entity.description
    dto.amount = entity.amount
    dto.currency = entity.currency ?? null
    dto.expenseDate = (toIsoString(entity.date) ?? '').slice(0, 10)
    dto.vendor = entity.vendor ?? null
    dto.notes = entity.notes ?? null
    dto.isRecurring = entity.isRecurring
    dto.status = entity.status ?? 'PAID'
    dto.recordedById = entity.recordedById
    dto.recordedBy = ExpenseRecordedByDto.fromModel(entity.recordedBy) ?? null
    dto.paymentMethod = entity.paymentMethod ?? null
    dto.receiptUrl = entity.receiptUrl ?? null
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    dto.updatedAt = toIsoString(entity.updatedAt) ?? ''
    dto.deletedAt = toIsoString(entity.deletedAt) ?? null
    dto.isDeleted = Boolean(entity.deletedAt)
    return dto
  }
}

export class ExpenseListItemDto extends ExpenseResponseDto implements ExpenseListItem {
  static fromEntity(entity?: ExpenseDetailModel | null): ExpenseListItemDto | null {
    if (!entity) return null
    return Object.assign(new ExpenseListItemDto(), ExpenseResponseDto.fromEntity(entity))
  }
}

export class ExpenseMonthlySummaryDto implements ExpenseMonthlySummary {
  year!: number
  month!: number
  totalAmount!: number
  expenseCount!: number
  recurringAmount!: number
  oneOffAmount!: number
  categoryBreakdown!: Record<string, number>

  static fromEntity(entity: MonthlyExpenseSummaryEntity | ExpenseMonthlySummary): ExpenseMonthlySummaryDto {
    const dto = new ExpenseMonthlySummaryDto()
    dto.year = 'summaryYear' in entity ? entity.summaryYear : entity.year
    dto.month = 'summaryMonth' in entity ? entity.summaryMonth : entity.month
    dto.totalAmount = entity.totalAmount
    dto.expenseCount = entity.expenseCount
    dto.recurringAmount = entity.recurringAmount
    dto.oneOffAmount =
      'oneOffAmount' in entity
        ? entity.oneOffAmount
        : Math.max(0, Math.round((entity.totalAmount - entity.recurringAmount) * 100) / 100)
    dto.categoryBreakdown = entity.categoryBreakdown ?? {}
    return dto
  }
}

export class ExpenseMonthlyRangeItemDto implements ExpenseMonthlyRangeItem {
  year!: number
  month!: number
  totalAmount!: number

  static fromModel(model: ExpenseMonthlyRangeItem): ExpenseMonthlyRangeItemDto {
    return Object.assign(new ExpenseMonthlyRangeItemDto(), model)
  }
}

export class ExpenseCategoryRangeItemDto implements ExpenseCategoryRangeItem {
  categoryId!: string
  name!: string
  slug!: string
  color!: string
  totalAmount!: number
  percentage!: number

  static fromModel(model: ExpenseCategoryRangeItem): ExpenseCategoryRangeItemDto {
    return Object.assign(new ExpenseCategoryRangeItemDto(), model)
  }
}

export class ExpensePnlSummaryDto implements ExpensePnlSummary {
  year!: number
  month!: number
  revenue!: number
  costOfGoods!: number
  grossProfit!: number
  grossMarginPercent!: number
  totalExpenses!: number
  expenseBreakdown!: Record<string, number>
  netProfit!: number
  netMarginPercent!: number
  isProfitable!: boolean

  static fromModel(model: ExpensePnlSummary): ExpensePnlSummaryDto {
    return Object.assign(new ExpensePnlSummaryDto(), model)
  }
}
