import { z } from 'zod'

/** Checkout form validation (Zod) — mirrors the API CheckoutRequest contract. */
export const checkoutSchema = z
  .object({
    customerName: z.string().trim().min(2, 'Name is required'),
    customerPhone: z
      .string()
      .trim()
      .min(6, 'A valid phone number is required')
      .max(30),
    customerEmail: z.string().trim().email('Invalid email').optional().or(z.literal('')),
    fulfillmentType: z.enum(['DELIVERY', 'PICKUP']).default('DELIVERY'),
    deliveryAddress: z.string().trim().optional(),
    deliveryCity: z.string().trim().optional(),
    deliveryNotes: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .refine(
    (value) => value.fulfillmentType !== 'DELIVERY' || Boolean(value.deliveryAddress),
    { message: 'Delivery address is required', path: ['deliveryAddress'] },
  )

export type CheckoutFormValues = z.infer<typeof checkoutSchema>
