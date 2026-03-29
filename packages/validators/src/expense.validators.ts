import { z } from 'zod'

export const CreateExpenseSchema = z.object({
  category: z.enum(['RENT', 'UTILITIES', 'SUPPLIES', 'SALARIES', 'TRANSPORT', 'MARKETING', 'MAINTENANCE', 'OTHER']),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  paymentMethod: z.string(),
  date: z.string().datetime(),
  receiptUrl: z.string().url().optional(),
})

export const UpdateExpenseSchema = CreateExpenseSchema.partial()

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
