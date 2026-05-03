import { z } from 'zod'
import { ContactType, DebtDirection, DebtStatus, PaymentMethod } from '@biztrack/types'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const CreateContactSchema = z.object({
  type: z.nativeEnum(ContactType),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(30).optional(),
  phoneAlt: z.string().trim().min(5).max(30).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
})

export const UpdateContactSchema = CreateContactSchema.partial()

export const RecordDebtPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod),
  paymentDate: z.string().regex(DATE_ONLY_REGEX),
  mobileMoneyReference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(5000).optional(),
})

export const WriteOffDebtSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export const ContactStatementQuerySchema = z.object({
  direction: z.nativeEnum(DebtDirection).optional(),
})

export const DebtsQuerySchema = z.object({
  status: z.nativeEnum(DebtStatus).optional(),
  contactId: z.string().uuid().optional(),
  dateFrom: z.string().regex(DATE_ONLY_REGEX).optional(),
  dateTo: z.string().regex(DATE_ONLY_REGEX).optional(),
})

export type CreateContactInput = z.infer<typeof CreateContactSchema>
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>
export type RecordDebtPaymentInput = z.infer<typeof RecordDebtPaymentSchema>
export type WriteOffDebtInput = z.infer<typeof WriteOffDebtSchema>
