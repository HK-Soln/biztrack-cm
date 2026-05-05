import { z } from 'zod'
import { PaymentMethod } from '@biztrack/types'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

export const CreateExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(HEX_COLOR_REGEX),
  icon: z.string().trim().max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const UpdateExpenseCategorySchema = CreateExpenseCategorySchema.partial()

export const CreateExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  description: z.string().trim().min(3).max(300),
  amount: z.number().positive(),
  expenseDate: z.string().regex(DATE_ONLY_REGEX),
  vendor: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(5000).optional(),
  isRecurring: z.boolean().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  receiptUrl: z.string().url().optional(),
})

export const UpdateExpenseSchema = CreateExpenseSchema.partial()

export type CreateExpenseCategoryInput = z.infer<typeof CreateExpenseCategorySchema>
export type UpdateExpenseCategoryInput = z.infer<typeof UpdateExpenseCategorySchema>
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>
