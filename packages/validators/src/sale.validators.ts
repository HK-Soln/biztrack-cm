import { z } from 'zod'

export const SaleItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
})

export const CreateSaleSchema = z.object({
  items: z.array(SaleItemSchema).min(1),
  paymentMethod: z.enum(['CASH', 'MTN_MOMO', 'ORANGE_MONEY', 'CARD', 'MIXED']),
  discountAmount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  momoReference: z.string().optional(),
  notes: z.string().max(500).optional(),
  deviceId: z.string().optional(),
})

export type CreateSaleInput = z.infer<typeof CreateSaleSchema>
