import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, PhoneInput } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useSessionStore } from '@/stores/session.store'
import { signInSchema, type SignInMode } from '@/lib/schemas'
import { normalizeNextStep, routeForNextStep } from '@/lib/auth-routing'
import { dataClient } from '@/lib/data-client'

// Feature 1: minimally wired to the BFF (password login) so the auth gate works
// end-to-end. The full designed sign-in (OTP/"SSO" tabs, offline) is Feature 2.
export function SignIn() {
  const navigate = useNavigate()
  const t = useT()
  const setStatus = useSessionStore((s) => s.setStatus)

  const [mode, setMode] = useState<SignInMode>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ identifier?: MessageKey; password?: MessageKey }>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const identifier = mode === 'email' ? email.trim() : (phone ?? '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const parsed = signInSchema(mode).safeParse({ identifier, password })
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors
      setErrors({
        identifier: f.identifier?.[0] as MessageKey | undefined,
        password: f.password?.[0] as MessageKey | undefined,
      })
      return
    }
    setErrors({})
    if (busy) return
    setBusy(true)
    const res = await dataClient.auth.login(identifier, password)
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error ?? 'Sign in failed.')
      return
    }
    // The account still owes a verification step (abandoned onboarding) — login sent a
    // fresh OTP and returned the step. Resume it on the sign-up screen, carrying the
    // channel + the identifier we have so that page can verify.
    const step = normalizeNextStep(res.nextStep)
    if (step === 'verify_phone' || step === 'verify_email') {
      const q = new URLSearchParams()
      q.set('verify', step === 'verify_email' ? 'email' : 'phone')
      if (mode === 'email') q.set('email', identifier)
      else q.set('phone', identifier)
      navigate(`/signup?${q.toString()}`)
      return
    }
    setStatus(res.session)
    navigate(routeForNextStep(res.nextStep))
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="mk">B</div>
        <div className="wm">BizTrack CM</div>
      </div>
      <div className="auth-h">
        <h1>{t('auth.welcomeBack')}</h1>
        <p>{t('auth.signinSub')}</p>
      </div>

      <form className="fform" onSubmit={submit}>
        <div className={`ff${errors.identifier ? ' invalid' : ''}`}>
          <label className="lbl2" htmlFor="i-id">
            {mode === 'email' ? t('auth.email') : t('auth.phone')}
            <button
              type="button"
              className="opt"
              style={{
                color: 'var(--brand-int)',
                background: 'none',
                border: 0,
                cursor: 'pointer',
              }}
              onClick={() => {
                setMode((m) => (m === 'email' ? 'phone' : 'email'))
                setErrors((e) => ({ ...e, identifier: undefined }))
              }}
            >
              {mode === 'email' ? t('auth.usePhoneInstead') : t('auth.useEmailInstead')}
            </button>
          </label>

          {mode === 'email' ? (
            <div className="inwrap has-lead">
              <svg
                className="lead"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              <Input
                id="i-id"
                type="email"
                placeholder="you@shop.cm"
                value={email}
                error={!!errors.identifier}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          ) : (
            <PhoneInput
              id="i-id"
              value={phone}
              onChange={setPhone}
              error={!!errors.identifier}
              placeholder="6 91 22 14 08"
            />
          )}

          {errors.identifier ? (
            <div className="msg err">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <span>{t(errors.identifier)}</span>
            </div>
          ) : null}
        </div>

        <div className={`ff${errors.password ? ' invalid' : ''}`}>
          <label className="lbl2" htmlFor="i-pw">
            {t('auth.password')}
            <a
              className="opt"
              onClick={() => navigate('/forgot-password')}
              style={{ color: 'var(--brand-int)', textDecoration: 'none', cursor: 'pointer' }}
            >
              {t('auth.forgot')}
            </a>
          </label>
          <div className="inwrap has-lead">
            <svg
              className="lead"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <Input
              id="i-pw"
              type={showPw ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              error={!!errors.password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="trail">
              <button
                type="button"
                className="eye"
                aria-label="Show password"
                onClick={() => setShowPw((v) => !v)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </span>
          </div>
          {errors.password ? (
            <div className="msg err">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <span>{t(errors.password)}</span>
            </div>
          ) : null}
        </div>

        {serverError ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
            {serverError}
          </p>
        ) : null}

        <label className="chk" style={{ marginTop: 2 }}>
          <input type="checkbox" defaultChecked />
          <span className="bx">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="m5 12 4 4L19 6" />
            </svg>
          </span>
          <span>{t('auth.keepSignedIn')}</span>
        </label>

        <Button type="submit" variant="primary" block loading={busy}>
          {t('auth.signIn')}
        </Button>
      </form>

      <div className="or">{t('auth.or')}</div>
      <div className="oauth">
        {/* Passwordless ("SSO"): channel picker (Email / SMS / WhatsApp) → OTP. */}
        <button type="button" onClick={() => navigate('/sso')}>
          <span className="g" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 8 9 5 9-5" />
            </svg>
          </span>
          {t('auth.useOneTimeCode')}
        </button>
      </div>
      <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
        {t('auth.oneTimeCodeHint')}
      </p>

      <div className="auth-foot">
        {t('auth.newToBiztrack')}{' '}
        <a onClick={() => navigate('/signup')} style={{ cursor: 'pointer' }}>
          {t('auth.createBusiness')}
        </a>
      </div>
    </div>
  )
}
