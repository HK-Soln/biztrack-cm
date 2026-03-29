import { z } from 'zod'

export const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().regex(/^(\+237)?6[5-9]\d{7}$/),
  password: z.string().min(8).max(100).optional(),
  language: z.enum(['fr', 'en']).optional().default('fr'),
})

export const LoginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().regex(/^(\+237)?6[5-9]\d{7}$/).optional(),
    password: z.string().min(1),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Email or phone is required',
    path: ['email'],
  })

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
