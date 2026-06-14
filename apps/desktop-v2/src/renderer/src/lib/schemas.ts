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

/** Standalone identifier checks (used by screens with inline, per-channel validation). */
export function isValidEmail(value: string): boolean {
  return z.string().email().safeParse(value).success
}

export { isValidPhone }

// ---- Sign up --------------------------------------------------------------
const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/

export const signUpSchema = z.object({
  businessName: z.string().trim().min(1, 'signup.businessRequired'),
  name: z.string().trim().min(1, 'signup.nameRequired'),
  phone: z.string().refine(isValidPhone, 'auth.invalidPhone'),
  password: z.string().min(8, 'signup.passwordWeak').regex(PASSWORD_COMPLEXITY, 'signup.passwordComplexity'),
  terms: z.boolean().refine((v) => v === true, 'signup.acceptTerms'),
})

export type SignUpValues = z.infer<typeof signUpSchema>

/** Password strength 0–4 (length, uppercase, digit, symbol) for the meter. */
export function passwordStrength(value: string): number {
  if (!value) return 0
  let s = 0
  if (value.length >= 8) s++
  if (/[A-Z]/.test(value)) s++
  if (/[0-9]/.test(value)) s++
  if (/[^A-Za-z0-9]/.test(value)) s++
  return s
}
