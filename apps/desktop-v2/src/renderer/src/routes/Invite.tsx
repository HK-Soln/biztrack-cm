import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, PhoneInput } from '@biztrack/ui/biztrack'
import type { InvitePreviewResponse } from '@biztrack/types'
import { useT, useLangStore } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useSessionStore } from '@/stores/session.store'
import { normalizeNextStep, routeForNextStep } from '@/lib/auth-routing'
import { dataClient } from '@/lib/data-client'
import { inviteRegisterSchema, passwordStrength } from '@/lib/schemas'

type PageState = 'loading' | 'valid' | 'invalid' | 'declined'
type Mode = 'new' | 'existing'
type FieldErrors = Partial<
  Record<'name' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'terms', MessageKey>
>

const PW_LABELS: MessageKey[] = [
  'signup.pwWeak',
  'signup.pwWeak',
  'signup.pwFair',
  'signup.pwGood',
  'signup.pwStrong',
]

function initials(s?: string | null): string {
  const p = (s || 'B').trim().split(/\s+/)
  const a = (p[0] || 'B')[0] || 'B'
  const b = p[1] ? p[1][0] : (p[0] || '')[1] || ''
  return (a + b).toUpperCase()
}

function daysLeft(iso?: string | null): number {
  if (!iso) return 0
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)
}

export function Invite() {
  const navigate = useNavigate()
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const setStatus = useSessionStore((s) => s.setStatus)
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [pageState, setPageState] = useState<PageState>('loading')
  const [preview, setPreview] = useState<InvitePreviewResponse | null>(null)
  const [mode, setMode] = useState<Mode>('new')

  // form state (register + sign-in share password)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [showPw, setShowPw] = useState(false)

  // Existing-user sign-in identifier (email or phone). The invite is contact-locked
  // server-side (acceptInvite verifies the signed-in account matches the invited
  // email/phone), so the user may authenticate with EITHER — we just default to the
  // channel the invite was sent on.
  const [siMode, setSiMode] = useState<'email' | 'phone'>('email')
  const [siEmail, setSiEmail] = useState('')
  const [siPhone, setSiPhone] = useState<string | undefined>(undefined)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // the identifier the invite was sent to (locked, unmasked)
  const maskedIdentifier = preview?.sentTo || '';
  const identifier = preview?.email ?? preview?.phone ?? ''
  const idIsEmail = identifier.includes('@')
  const otherOnFile =
    preview?.email && preview?.phone ? (idIsEmail ? preview.phone : preview.email) : null

  // --- load the invite preview ---
  useEffect(() => {
    let alive = true
    if (!token) {
      setPageState('invalid')
      return
    }
    void (async () => {
      try {
        const res = await dataClient.auth.getInvitePreview(token)
        if (!alive) return
        if (res.ok) {
          setPreview(res.preview)
          setPageState('valid')
        } else {
          setServerError(res.error)
          setPageState('invalid')
        }
      } catch (e) {
        if (!alive) return
        setServerError(e instanceof Error ? e.message : 'Could not load the invitation.')
        setPageState('invalid')
      }
    })()
    return () => {
      alive = false
    }
  }, [token])

  // Pre-fill the locked identifier (and any other contact already on file). The locked
  // field is shown read-only in the idlock; the OTHER contact is an editable input.
  useEffect(() => {
    if (!preview) return
    if (preview.email) { setEmail(preview.email); setSiEmail(preview.email) }
    if (preview.phone) { setPhone(preview.phone); setSiPhone(preview.phone) }
    // Default the sign-in channel to whatever the invite was sent on.
    setSiMode(preview.email ? 'email' : 'phone')
  }, [preview])

  const switchMode = (next: Mode) => {
    setMode(next)
    setErrors({})
    setServerError(null)
  }

  // --- new user: register with the invite token, then go to the next step ---
  const submitNew = async () => {
    if (busy) return
    const emailVal = idIsEmail ? identifier : email.trim()
    const phoneVal = idIsEmail ? (phone ?? '') : identifier

    const parsed = inviteRegisterSchema.safeParse({
      name,
      email: emailVal,
      phone: phoneVal,
      password,
      confirmPassword,
      terms,
    })

    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors
      setErrors({
        name: f.name?.[0] as MessageKey | undefined,
        email: f.email?.[0] as MessageKey | undefined,
        phone: f.phone?.[0] as MessageKey | undefined,
        password: f.password?.[0] as MessageKey | undefined,
        confirmPassword: f.confirmPassword?.[0] as MessageKey | undefined,
        terms: f.terms?.[0] as MessageKey | undefined,
      })
      return
    }
    setErrors({})
    setBusy(true)
    setServerError(null)
    const res = await dataClient.auth.register({
      name: name.trim(),
      phone: phoneVal,
      email: emailVal,
      password,
      language: lang,
      inviteToken: token,
    })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error ?? t('invite.genericError'))
      return
    }
    // Redirect to the page the backend's nextStep points at, carrying the invite token +
    // the explicit channel to verify (so the OTP screen renders by next-step, not by
    // guessing from which of phone/email is present) + the registered phone/email (the
    // typed phone isn't in the invite preview, so it can't be re-fetched from the token).
    const next = routeForNextStep(res.nextStep)
    const q = new URLSearchParams()
    if (token) q.set('token', token)
    q.set('verify', normalizeNextStep(res.nextStep) === 'verify_email' ? 'email' : 'phone')
    if (phoneVal) q.set('phone', phoneVal)
    if (emailVal) q.set('email', emailVal)
    const qs = q.toString()
    navigate(qs ? `${next}?${qs}` : next)
  }

  // --- existing user: sign in (email OR phone) then accept ---
  const submitExisting = async () => {
    if (busy) return
    const signInId = siMode === 'email' ? siEmail.trim() : (siPhone ?? '')
    if (!signInId) {
      setServerError(siMode === 'email' ? t('invite.enterEmail') : t('invite.enterPhone'))
      return
    }
    if (!password) {
      setServerError(t('invite.enterPassword'))
      return
    }
    setBusy(true)
    setServerError(null)
    // acceptInvite (below) verifies the signed-in account matches the invited contact,
    // so signing in with a different channel of the SAME account is safe.
    const login = await dataClient.auth.login(signInId, password)
    if (!login.ok) {
      setBusy(false)
      setServerError(login.error ?? t('invite.signInFailed'))
      return
    }
    setStatus(login.session)

    // If the account still owes an onboarding step (e.g. its phone/email isn't verified),
    // login returns that step instead of completing. Route there carrying the invite token
    // + the signed-in identifier so that page can finish AND accept the invite (the verify
    // endpoints take the token). Only when login is fully complete do we accept here.
    const loginStep = normalizeNextStep(login.nextStep)
    if (loginStep !== 'dashboard') {
      setBusy(false)
      const q = new URLSearchParams()
      q.set('token', token)
      q.set('verify', loginStep === 'verify_email' ? 'email' : 'phone')
      if (siMode === 'email') q.set('email', signInId)
      else q.set('phone', signInId)
      const next = routeForNextStep(login.nextStep)
      navigate(`${next}?${q.toString()}`)
      return
    }

    const accepted = await dataClient.auth.acceptInvite(token)
    setBusy(false)
    if (!accepted.ok) {
      setServerError(accepted.error ?? t('invite.genericError'))
      return
    }
    setStatus(accepted.session)
    navigate(accepted.nextStep ? routeForNextStep(accepted.nextStep) : '/')
  }

  const decline = async () => {
    if (busy) return
    setBusy(true)
    await dataClient.auth.rejectInvite(token)
    setBusy(false)
    setPageState('declined')
  }

  // ---------------- render ----------------
  const Logo = (
    <div className="auth-logo">
      <div className="mk">B</div>
      <div className="wm">BizTrack CM</div>
    </div>
  )

  if (pageState === 'loading') {
    return (
      <div className="auth-card">
        {Logo}
        <div className="auth-h">
          <p>{t('invite.loading')}</p>
        </div>
      </div>
    )
  }

  if (pageState === 'invalid' || pageState === 'declined') {
    const declined = pageState === 'declined'
    const who = preview?.invitedByName || preview?.businessName || 'BizTrack'
    return (
      <div className="auth-card">
        {Logo}
        <div className={`edge ${declined ? 'revoked' : 'expired'}`}>
          <div className="ei">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              {declined ? <path d="m9 9 6 6M15 9l-6 6" /> : <path d="M12 7v5l3 2" />}
            </svg>
          </div>
          <h1>{declined ? t('invite.declinedTitle') : t('invite.invalidTitle')}</h1>
          <p>{declined ? t('invite.declinedBody') : (serverError ?? t('invite.invalidBody'))}</p>
          {preview ? (
            <div className="who">
              <span className="av">{initials(who)}</span>
              {t('invite.invitedByShort')}&nbsp;
              <b style={{ color: 'var(--text)', fontWeight: 650, marginLeft: 2 }}>{who}</b>
            </div>
          ) : null}
          <a
            className="btn btn-soft btn-block"
            onClick={() => navigate('/signin')}
            style={{ marginTop: 24, textDecoration: 'none', cursor: 'pointer' }}
          >
            {t('invite.goSignIn')}
          </a>
        </div>
      </div>
    )
  }

  // ---- valid invite ----
  const d = daysLeft(preview?.expiresAt)
  const soon = d <= 2
  const biz = preview?.businessName ?? 'BizTrack'
  const strength = passwordStrength(password)

  return (
    <div className="auth-card">
      {Logo}

      <div className="join-hero">
        <div className="jh-logo">{initials(biz)}</div>
        <div className="jh-eyebrow">
          {preview?.invitedByName ? (
            <>
              <span className="av">{initials(preview.invitedByName)}</span>
              <span>
                <b>{preview.invitedByName}</b> {t('invite.invitedYou')}
              </span>
            </>
          ) : (
            <span>{t('invite.invitedYouAnon')}</span>
          )}
        </div>
        <h1>{biz}</h1>
        <div className="jh-role">
          {t('invite.asRole')}{' '}
          {preview?.role ? (
            <span className="st" style={{ color: 'var(--success)', background: 'var(--success-soft)' }}>
              {preview.role}
            </span>
          ) : (
            <span className="st st-neutral">{t('invite.teamMember')}</span>
          )}
          <span style={{ color: 'var(--text-muted)' }}>{t('invite.onBiztrack')}</span>
        </div>
      </div>

      <div className="fseg" style={{ marginBottom: 18 }}>
        <button type="button" aria-pressed={mode === 'new'} onClick={() => switchMode('new')}>
          {t('invite.modeNew')}
        </button>
        <button type="button" aria-pressed={mode === 'existing'} onClick={() => switchMode('existing')}>
          {t('invite.modeExisting')}
        </button>
      </div>

      {mode === 'new' ? (
        <>
      <div className="idlock">
        <div className="ic">
          {idIsEmail ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="7" y="3" width="10" height="18" rx="2" />
              <path d="M11 18h2" />
            </svg>
          )}
        </div>
        <div className="tx">
          <div className="v">{maskedIdentifier}</div>
          <div className="k">{mode === 'new' ? t('invite.fromInvitation') : t('invite.signingInAs')}</div>
        </div>
        <span className="lk">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
      </div>
      {otherOnFile ? (
        <div className="alt-id">
          {t('invite.alsoOnFile')} <b>{otherOnFile}</b>
        </div>
      ) : null}
        </>
      ) : null}

      <form
        className="fform"
        style={{ marginTop: 16 }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void (mode === 'new' ? submitNew() : submitExisting())
        }}
      >
        {mode === 'new' ? (
          <>
            <div className={`ff${errors.name ? ' invalid' : ''}`}>
              <label className="lbl2">
                {t('signup.fullName')} <span className="req">*</span>
              </label>
              <Input
                placeholder={t('signup.namePlaceholder')}
                value={name}
                error={!!errors.name}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name ? <FieldError message={t(errors.name)} /> : null}
            </div>

            {/* The contact NOT locked by the invite — both email & phone are required. */}
            {idIsEmail ? (
              <div className={`ff${errors.phone ? ' invalid' : ''}`}>
                <label className="lbl2">
                  {t('signup.phone')} <span className="req">*</span>
                </label>
                <PhoneInput value={phone} onChange={setPhone} error={!!errors.phone} placeholder="6 91 22 14 08" />
                {errors.phone ? (
                  <FieldError message={t(errors.phone)} />
                ) : (
                  <div className="hint">{t('signup.phoneHint')}</div>
                )}
              </div>
            ) : (
              <div className={`ff${errors.email ? ' invalid' : ''}`}>
                <label className="lbl2">
                  {t('signup.email')} <span className="req">*</span>
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
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {errors.email ? <FieldError message={t(errors.email)} /> : null}
              </div>
            )}

            <div className={`ff${errors.password ? ' invalid' : ''}`}>
              <label className="lbl2">
                {t('signup.password')} <span className="req">*</span>
              </label>
              <PasswordField
                value={password}
                show={showPw}
                onToggle={() => setShowPw((v) => !v)}
                onChange={setPassword}
                placeholder={t('signup.passwordPlaceholder')}
                autoComplete="new-password"
              />
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
              <PasswordField
                value={confirmPassword}
                show={showPw}
                onToggle={() => setShowPw((v) => !v)}
                onChange={setConfirmPassword}
                placeholder={t('signup.confirmPlaceholder')}
                autoComplete="new-password"
              />
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
          </>
        ) : (
          <>
            <div className="ff">
              <label className="lbl2">
                {siMode === 'email' ? t('auth.email') : t('auth.phone')}
                <button
                  type="button"
                  className="opt"
                  style={{ color: 'var(--brand-int)', background: 'none', border: 0, cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => { setSiMode((m) => (m === 'email' ? 'phone' : 'email')); setServerError(null) }}
                >
                  {siMode === 'email' ? t('auth.usePhoneInstead') : t('auth.useEmailInstead')}
                </button>
              </label>
              {siMode === 'email' ? (
                <div className="inwrap has-lead">
                  <svg className="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  <Input
                    type="email"
                    placeholder="you@shop.cm"
                    value={siEmail}
                    autoComplete="email"
                    onChange={(e) => setSiEmail(e.target.value)}
                  />
                </div>
              ) : (
                <PhoneInput value={siPhone} onChange={setSiPhone} placeholder="6 91 22 14 08" />
              )}
            </div>
            <div className="ff">
              <label className="lbl2">
                {t('invite.yourPassword')}
                <a className="opt" href="#" style={{ color: 'var(--brand-int)', textDecoration: 'none', fontWeight: 600 }}>
                  {t('auth.forgot')}
                </a>
              </label>
              <PasswordField
                value={password}
                show={showPw}
                onToggle={() => setShowPw((v) => !v)}
                onChange={setPassword}
                placeholder={t('invite.pwSignInPlaceholder')}
                autoComplete="current-password"
              />
            </div>
          </>
        )}

        {serverError ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" block loading={busy}>
          {t('invite.accept')} {biz}
        </Button>
      </form>

      <div className={`exp-note${soon ? ' soon' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        {d <= 0 ? t('invite.expiredNote') : d === 1 ? t('invite.expiresTomorrow') : `${t('invite.expiresIn')} ${d} ${t('invite.days')}`}
      </div>

      <div className="decline">
        <button type="button" onClick={() => void decline()} disabled={busy}>
          {t('invite.decline')}
        </button>
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

function PasswordField({
  value,
  show,
  onToggle,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string
  show: boolean
  onToggle: () => void
  onChange: (v: string) => void
  placeholder: string
  autoComplete: string
}) {
  return (
    <div className="inwrap has-lead">
      <svg className="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="4" y="11" width="16" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <Input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="trail">
        <button type="button" className="eye" aria-label="Show password" onClick={onToggle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </span>
    </div>
  )
}
