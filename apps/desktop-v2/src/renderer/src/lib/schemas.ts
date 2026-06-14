import { z } from 'zod'
import { isValidPhone } from '@biztrack/ui/biztrack'

// Validation messages are i18n KEYS — the screen resolves them with t(). This keeps
// schemas the single source of truth for form rules across the app.
const password = z.string().min(1, 'auth.passwordRequired')

export const emailSignInSchema = z.object({
  identifier: z.string().email('auth.invalidEmail'),
  password,
})

export const phoneSignInSchema = z.object({
  identifier: z.string().refine(isValidPhone, 'auth.invalidPhone'),
  password,
})

export type SignInMode = 'email' | 'phone'

export function signInSchema(mode: SignInMode) {
  return mode === 'email' ? emailSignInSchema : phoneSignInSchema
}

export type SignInValues = z.infer<typeof emailSignInSchema>
