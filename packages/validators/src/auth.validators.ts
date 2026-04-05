import { z } from 'zod'

export const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+237[6-9]\d{8}$/),
  password: z.string().min(8).max(72),
  language: z.enum(['fr', 'en']).optional().default('fr'),
})

export const LoginSchema = z
  .object({
    identifier: z.string().min(1),
    password: z.string().min(1),
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
