'use client'

import { useState, type ChangeEvent, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PrefferedPhoneChannel, type RegisterRequest } from '@biztrack/types'
import { Input, Button, PhoneInput, InputPassword } from '@biztrack/ui'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth/AuthCard'
import {
  getAuthMaskedEmail,
  getAuthMaskedPhone,
  getAuthOtpExpiresIn,
  register,
} from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { useAuthStore } from '@/stores/auth.store'
import { normalizeAuthNextStep, routeForNextStep } from '@/lib/auth-routing'
import bcrypt from 'bcryptjs'

// ── Password rules ─────────────────────────────────────────────────────────────

type PasswordRule = {
  key: string
  label: string
  test: (v: string) => boolean
}

const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length',    label: 'At least 8 characters',                    test: (v) => v.length >= 8 },
  { key: 'uppercase', label: 'At least one uppercase letter',             test: (v) => /[A-Z]/.test(v) },
  { key: 'lowercase', label: 'At least one lowercase letter',             test: (v) => /[a-z]/.test(v) },
  { key: 'digit',     label: 'At least one number',                       test: (v) => /\d/.test(v) },
  { key: 'special',   label: 'At least one special character (!@#$…)',   test: (v) => /[^A-Za-z0-9]/.test(v) },
]

function validatePassword(value: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.label)
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const searchParams = useSearchParams()

  const invitePhone = searchParams.get('phone') ?? ''
  const inviteEmail = searchParams.get('email') ?? ''
  const lockedPhone = Boolean(invitePhone)
  const lockedEmail = Boolean(inviteEmail)

  const pendingInviteToken = useAuthStore((s) => s.pending.inviteToken)
  const setPending = useAuthStore((s) => s.setPending)
  const storePasswordHash = useAuthStore((s) => s.storePasswordHash)

  const [form, setForm] = useState<RegisterRequest>({
    name: '',
    phone: invitePhone,
    email: inviteEmail,
    password: '',
    preferredPhoneChannel: PrefferedPhoneChannel.WHATSAPP,
  })
  const [confirmPassword, setConfirmPassword] = useState('')

  // Validation state — only shown after the field is touched
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [confirmTouched, setConfirmTouched] = useState(false)

  const [loading, setLoading] = useState(false)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const handleChange = (field: keyof RegisterRequest) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const confirmError =
    confirmTouched && confirmPassword !== form.password ? 'Passwords do not match' : null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    // Mark both touched so errors show
    setPasswordTouched(true)
    setConfirmTouched(true)

    const pwdErrors = validatePassword(form.password)
    if (pwdErrors.length > 0) return
    if (form.password !== confirmPassword) return

    setLoading(true)
    try {
      const response = await register({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        password: form.password,
        preferredPhoneChannel: form.preferredPhoneChannel,
        inviteToken: pendingInviteToken ?? undefined,
        locale,
      })
      setPending({
        phone: form.phone,
        email: form.email || undefined,
        inviteToken: pendingInviteToken ?? null,
        otpMessage: null,
        maskedPhone: getAuthMaskedPhone(response),
        maskedEmail: getAuthMaskedEmail(response),
        otpExpiresIn: getAuthOtpExpiresIn(response),
      })
      const hash = await bcrypt.hash(form.password, 10)
      await storePasswordHash(hash)

      const nextStep = normalizeAuthNextStep(response.nextStep)
      return goTo(routeForNextStep(nextStep))
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('register.error_default')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title={t('register.title')} subtitle={t('register.subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">{t('register.name_label')}</label>
          <Input value={form.name} onChange={handleChange('name')} required />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">{t('register.phone_label')}</label>
          <PhoneInput
            value={form.phone}
            onChange={(value: string | undefined) => setForm((prev) => ({ ...prev, phone: value || '' }))}
            disabled={lockedPhone}
            required
          />
          {lockedPhone ? (
            <p className="mt-1 text-xs text-muted-foreground">{t('register.invite_field_locked')}</p>
          ) : null}
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">{t('register.email_label')}</label>
          <Input
            value={form.email}
            onChange={handleChange('email')}
            placeholder={t('register.email_placeholder')}
            disabled={lockedEmail}
          />
          {lockedEmail ? (
            <p className="mt-1 text-xs text-muted-foreground">{t('register.invite_field_locked')}</p>
          ) : null}
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">
            {t('register.password_label')}
          </label>
          <InputPassword
            value={form.password}
            onChange={(e) => {
              handleChange('password')(e)
              if (!passwordTouched) setPasswordTouched(true)
            }}
            onBlur={() => setPasswordTouched(true)}
            required
          />
          {passwordTouched && form.password.length > 0 && (
            <ul className="mt-2 space-y-1">
              {PASSWORD_RULES.map((rule) => {
                const passing = rule.test(form.password)
                return (
                  <li key={rule.key} className="flex items-center gap-1.5 text-xs">
                    <span
                      className={
                        passing
                          ? 'text-success-600 dark:text-success-400'
                          : 'text-muted-foreground'
                      }
                    >
                      {passing ? (
                        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 6 2.5 2.5L10 3.5" /></svg>
                      ) : (
                        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /></svg>
                      )}
                    </span>
                    <span className={passing ? 'text-success-600 dark:text-success-400' : 'text-muted-foreground'}>
                      {rule.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {passwordTouched && form.password.length === 0 && (
            <p className="mt-1 text-xs text-destructive">Password is required</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Confirm password</label>
          <InputPassword
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              if (!confirmTouched) setConfirmTouched(true)
            }}
            onBlur={() => setConfirmTouched(true)}
            required
          />
          {confirmError ? (
            <p className="mt-1 text-xs text-destructive">{confirmError}</p>
          ) : confirmTouched && confirmPassword.length > 0 && confirmPassword === form.password ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-success-600 dark:text-success-400">
              <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 6 2.5 2.5L10 3.5" /></svg>
              Passwords match
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t('register.loading') : t('register.continue')}
        </Button>
      </form>

      <div className="mt-6 text-sm text-muted-foreground">
        {t('register.have_account')}{' '}
        <Link className="text-foreground font-medium" href={`/${locale}/login`}>
          {t('register.login_link')}
        </Link>
      </div>
    </AuthCard>
  )
}
