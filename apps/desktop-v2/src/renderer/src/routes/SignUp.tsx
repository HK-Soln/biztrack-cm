import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, OtpInput, PhoneInput } from '@biztrack/ui/biztrack'
import { useT, useLangStore } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useSessionStore } from '@/stores/session.store'
import { passwordStrength, signUpSchema } from '@/lib/schemas'
import { normalizeNextStep, routeForNextStep } from '@/lib/auth-routing'
import { dataClient } from '@/lib/data-client'

type Step = 'form' | 'verify'
type VerifyChannel = 'phone' | 'email'
type FieldErrors = Partial<
  Record<'businessName' | 'name' | 'phone' | 'email' | 'password' | 'confirmPassword' | 'terms', MessageKey>
>

const PW_LABELS: MessageKey[] = ['signup.pwWeak', 'signup.pwWeak', 'signup.pwFair', 'signup.pwGood', 'signup.pwStrong']

export function SignUp() {
  const navigate = useNavigate()
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const setStatus = useSessionStore((s) => s.setStatus)
  const [params] = useSearchParams()

  // Arriving from the accept-invite page after register: ?phone=… means the OTP was
  // already sent — resume directly on the phone-verification step instead of the form.
  // ?email=… seeds the email so the follow-on email-verify step (same page) has it.
  const resumePhone = params.get('phone') ?? ''
  const resumeEmail = params.get('email') ?? ''
  // Arriving from the accept-invite page (existing-user tab): carry the invite token so
  // completing verification also accepts the invite server-side.
  const inviteToken = params.get('token') || undefined
  // Which channel to resume verifying (set by SignIn when login returns a verify step,
  // or implied by ?phone= after register). 'phone' | 'email'.
  const resumeVerify = params.get('verify')
  const resumeChannel: VerifyChannel = resumeVerify === 'email' ? 'email' : 'phone'
  const resuming = !!resumePhone || resumeVerify === 'phone' || resumeVerify === 'email'

  const [step, setStep] = useState<Step>(resuming ? 'verify' : 'form')
  const [businessName, setBusinessName] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState<string | undefined>(resumePhone || undefined)
  const [email, setEmail] = useState(resumeEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [verifyChannel, setVerifyChannel] = useState<VerifyChannel>(resumeChannel)
  const [maskedDest, setMaskedDest] = useState(resumeChannel === 'email' ? resumeEmail : resumePhone)
  const [resendIn, setResendIn] = useState(resuming ? 30 : 0)

  const strength = passwordStrength(password)

  useEffect(() => {
    if (step !== 'verify' || resendIn <= 0) return
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [step, resendIn])

  // Resuming an invite (token in the URL): pull the invited contact + masked label from
  // the invite so the OTP screen has the address to verify and a nice masked destination,
  // without every value having to be threaded through the URL. URL params win if present.
  useEffect(() => {
    if (!inviteToken) return
    let alive = true
    void dataClient.auth.getInvitePreview(inviteToken).then((res) => {
      if (!alive || !res.ok) return
      if (res.preview.phone) setPhone((p) => p || res.preview.phone || undefined)
      if (res.preview.email) setEmail((e) => e || res.preview.email || '')
      if (res.preview.sentTo) setMaskedDest((m) => m || res.preview.sentTo || '')
    })
    return () => {
      alive = false
    }
  }, [inviteToken])

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const parsed = signUpSchema.safeParse({
      businessName,
      name,
      phone: phone ?? '',
      email,
      password,
      confirmPassword,
      terms,
    })
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors
      setErrors({
        businessName: f.businessName?.[0] as MessageKey | undefined,
        name: f.name?.[0] as MessageKey | undefined,
        phone: f.phone?.[0] as MessageKey | undefined,
        email: f.email?.[0] as MessageKey | undefined,
        password: f.password?.[0] as MessageKey | undefined,
        confirmPassword: f.confirmPassword?.[0] as MessageKey | undefined,
        terms: f.terms?.[0] as MessageKey | undefined,
      })
      return
    }
    setErrors({})
    if (busy) return
    setBusy(true)
    const trimmedEmail = email.trim()
    const res = await dataClient.auth.register({
      name,
      phone: phone!,
      password,
      businessName,
      email: trimmedEmail || undefined,
      language: lang,
    })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error ?? 'Could not create your account.')
      return
    }
    // Registration always verifies the phone first.
    setVerifyChannel('phone')
    setMaskedDest(res.context?.maskedPhone ?? phone ?? '')
    setCode('')
    setStep('verify')
    setResendIn(30)
  }

  const verify = async (value?: string) => {
    const otp = value ?? code
    if (otp.length !== 6 || busy) return
    if (verifyChannel === 'phone' ? !phone : !email.trim()) return
    setBusy(true)
    setServerError(null)
    const res =
      verifyChannel === 'phone'
        ? await dataClient.auth.verifyPhone(phone!, otp, inviteToken)
        : await dataClient.auth.verifyEmail(email.trim(), otp, inviteToken)
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error ?? t('sso.invalidCode'))
      return
    }
    setStatus(res.session)
    // If the backend now wants email verification, switch the step to email.
    if (normalizeNextStep(res.nextStep) === 'verify_email') {
      setVerifyChannel('email')
      setMaskedDest(res.context?.maskedEmail ?? email.trim())
      setCode('')
      setResendIn(30)
      return
    }
    navigate(routeForNextStep(res.nextStep))
  }

  const resend = async () => {
    if (resendIn > 0) return
    if (verifyChannel === 'phone' && phone) await dataClient.auth.resendOtp(phone, 'VERIFY_PHONE')
    else if (verifyChannel === 'email') await dataClient.auth.resendOtp(email.trim(), 'VERIFY_EMAIL')
    setResendIn(30)
  }

  if (step === 'verify') {
    return (
      <div className="auth-card">
        <div className="auth-logo">
          <div className="mk">B</div>
          <div className="wm">BizTrack CM</div>
        </div>
        {resumePhone ? null : (
          <button type="button" className="auth-back" onClick={() => setStep('form')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t('sso.changeChannel')}
          </button>
        )}
        <div className="auth-h">
          <h1>{verifyChannel === 'email' ? t('verify.emailTitle') : t('verify.title')}</h1>
          <p>
            {t('verify.sentTo')} <b style={{ color: 'var(--text)' }}>{maskedDest}</b>.
          </p>
        </div>
        <form
          className="fform"
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <OtpInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} error={!!serverError} />
          {serverError ? (
            <div className="ff invalid">
              <div className="msg err" style={{ justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
                <span>{serverError}</span>
              </div>
            </div>
          ) : null}
          <Button type="submit" variant="primary" block loading={busy} disabled={code.length !== 6}>
            {t('verify.verify')}
          </Button>
        </form>
        <div className="resend">
          {t('sso.didntGet')}{' '}
          {resendIn > 0 ? (
            <span>
              {t('sso.resendIn')} <b>0:{resendIn < 10 ? `0${resendIn}` : resendIn}</b>
            </span>
          ) : (
            <a onClick={() => void resend()}>{t('sso.resend')}</a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="mk">B</div>
        <div className="wm">BizTrack CM</div>
      </div>
      <div className="auth-h">
        <div className="ey">{t('signup.eyebrow')}</div>
        <h1>{t('signup.title')}</h1>
        <p>{t('signup.subtitle')}</p>
      </div>

      <form className="fform" onSubmit={submitForm}>
        <div className={`ff${errors.businessName ? ' invalid' : ''}`}>
          <label className="lbl2">
            {t('signup.businessName')} <span className="req">*</span>
          </label>
          <div className="inwrap has-lead">
            <svg className="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5" />
            </svg>
            <Input
              placeholder={t('signup.businessPlaceholder')}
              value={businessName}
              error={!!errors.businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
          {errors.businessName ? <FieldError message={t(errors.businessName)} /> : null}
        </div>

        <div className={`ff${errors.name ? ' invalid' : ''}`}>
          <label className="lbl2">
            {t('signup.fullName')} <span className="req">*</span>
          </label>
          <Input
            placeholder={t('signup.namePlaceholder')}
            value={name}
            error={!!errors.name}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name ? <FieldError message={t(errors.name)} /> : null}
        </div>

        <div className={`ff${errors.phone ? ' invalid' : ''}`}>
          <label className="lbl2">
            {t('signup.phone')} <span className="req">*</span>
          </label>
          <PhoneInput value={phone} onChange={setPhone} error={!!errors.phone} placeholder="6 91 22 14 08" />
          {errors.phone ? <FieldError message={t(errors.phone)} /> : <div className="hint">{t('signup.phoneHint')}</div>}
        </div>

        <div className={`ff${errors.email ? ' invalid' : ''}`}>
          <label className="lbl2">
            {t('signup.email')} <span className="opt" style={{ marginLeft: 'auto' }}>{t('signup.emailOptional')}</span>
          </label>
          <div className="inwrap has-lead">
            <svg className="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <Input
              type="email"
              placeholder={t('signup.emailPlaceholder')}
              value={email}
              error={!!errors.email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {errors.email ? <FieldError message={t(errors.email)} /> : null}
        </div>

        <div className={`ff${errors.password ? ' invalid' : ''}`}>
          <label className="lbl2">
            {t('signup.password')} <span className="req">*</span>
          </label>
          <div className="inwrap has-lead">
            <svg className="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <Input
              type={showPw ? 'text' : 'password'}
              placeholder={t('signup.passwordPlaceholder')}
              value={password}
              error={!!errors.password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="trail">
              <button type="button" className="eye" aria-label="Show password" onClick={() => setShowPw((v) => !v)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </span>
          </div>
          <div className={`pwbar${strength ? ` s${strength}` : ''}`}>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="pwmeta">
            {errors.password ? t(errors.password) : password ? t(PW_LABELS[strength]!) : t('signup.passwordHint')}
          </div>
        </div>

        <div className={`ff${errors.confirmPassword ? ' invalid' : ''}`}>
          <label className="lbl2">
            {t('signup.confirmPassword')} <span className="req">*</span>
          </label>
          <div className="inwrap has-lead">
            <svg className="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <Input
              type={showPw ? 'text' : 'password'}
              placeholder={t('signup.confirmPlaceholder')}
              value={confirmPassword}
              error={!!errors.confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {errors.confirmPassword ? <FieldError message={t(errors.confirmPassword)} /> : null}
        </div>

        <label className="chk">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span className="bx">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="m5 12 4 4L19 6" />
            </svg>
          </span>
          <span>{t('signup.terms')}</span>
        </label>
        {errors.terms ? (
          <div className="ff invalid" style={{ marginTop: -6 }}>
            <FieldError message={t(errors.terms)} />
          </div>
        ) : null}

        {serverError ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" block loading={busy}>
          {t('signup.submit')}
        </Button>
      </form>

      <div className="auth-foot">
        {t('signup.haveAccount')} <a onClick={() => navigate('/signin')} style={{ cursor: 'pointer' }}>{t('auth.signIn')}</a>
      </div>
    </div>
  )
}

function FieldError({ message }: { message: string }) {
  return (
    <div className="msg err">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
