'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { OtpType } from '@biztrack/types'
import { Button, InputOTP, InputOTPGroup, InputOTPSlot } from '@biztrack/ui'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth/AuthCard'
import {
  getAuthMaskedEmail,
  getAuthOtpExpiresIn,
  getAuthTokens,
  getCurrentUser,
  resendOtp,
  verifyEmail,
} from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { useAuthStore } from '@/stores/auth.store'
import { routeForNextStep } from '@/lib/auth-routing'
import { upsertLocalUserProfile } from '@/services/local-user-profiles.local'

export default function VerifyEmailPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  
  const email = useAuthStore((s) => s.pending.email)
  const inviteToken = useAuthStore((s) => s.pending.inviteToken)
  const otpMessage = useAuthStore((s) => s.pending.otpMessage)
  const maskedEmail = useAuthStore((s) => s.pending.maskedEmail)
  const setTokens = useAuthStore((s) => s.setTokens)
  const setPending = useAuthStore((s) => s.setPending)
  const applyUser = useAuthStore((s) => s.applyUser)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const submit = async () => {
    if (!email) return goTo('/register')
    setLoading(true)
    try {
      const response = await verifyEmail({ email, code, inviteToken: inviteToken ?? undefined })
      const tokens = getAuthTokens(response)
      if (tokens) {
        await setTokens(tokens)
      }

      // Navigate immediately — awaiting getCurrentUser() here would create a
      // window where AuthRedirect (seeing the new phase2 token) fires a
      // competing router.replace('/') before this goTo resolves.
      goTo(routeForNextStep(response.nextStep))

      // Persist user profile in the background — non-blocking, non-fatal.
      if (tokens) {
        void getCurrentUser()
          .then(async (user) => {
            await upsertLocalUserProfile(user)
            applyUser({
              id: user.id,
              name: user.name ?? null,
              email: user.email ?? null,
              phone: user.phone ?? null,
              avatarUrl: user.avatarUrl ?? null,
              language: user.language ?? null,
            })
          })
          .catch(() => {})
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('otp.invalid')))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await submit()
  }

  useEffect(() => {
    if (code.length === 6 && !loading) {
      submit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const handleResend = async () => {
    if (!email) return
    setResending(true)
    try {
      const response = await resendOtp({ identifier: email, type: OtpType.VERIFY_EMAIL })
      setPending({
        otpMessage: null,
        maskedEmail: getAuthMaskedEmail(response),
        otpExpiresIn: getAuthOtpExpiresIn(response),
      })
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthCard title={t('verify_email.title')} subtitle={t('verify_email.subtitle')}>
      {(otpMessage || maskedEmail || email) && (
        <p className="text-sm text-muted-foreground mb-4">
          {otpMessage ?? t('otp.sent_to', { target: maskedEmail ?? email ?? '' })}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">{t('otp.code_label')}</label>
          <InputOTP value={code} onChange={setCode} maxLength={6} className="w-full" autoFocus>
            <InputOTPGroup className="w-full">
              {Array.from({ length: 6 }).map((_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t('otp.loading') : t('otp.verify')}
        </Button>
      </form>
      <button
        className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        onClick={handleResend}
        disabled={resending}
      >
        {resending ? t('otp.resending') : t('otp.resend')}
      </button>
    </AuthCard>
  )
}
