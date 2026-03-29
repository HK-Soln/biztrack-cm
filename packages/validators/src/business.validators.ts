import { z } from 'zod'

export const CreateBusinessSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(500).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('CM'),
  currency: z.enum(['XAF', 'USD', 'EUR']).default('XAF'),
})

export const UpdateBusinessSchema = CreateBusinessSchema.partial()

export type CreateBusinessInput = z.infer<typeof CreateBusinessSchema>
export type UpdateBusinessInput = z.infer<typeof UpdateBusinessSchema>
