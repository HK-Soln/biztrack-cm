import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, OtpInput, PhoneInput, isValidPhone, toast } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { OtpChannel } from '@shared/ipc'
import { isValidEmail } from '@/lib/schemas'
import { dataClient } from '@/lib/data-client'

type Step = 'channel' | 'verify'

// Matches the API's password rule (register / reset-password DTOs).
const STRONG_PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

const CHANNELS: Array<{ id: OtpChannel; label: MessageKey; icon: ReactNode }> = [
  {
    id: 'EMAIL',
    label: 'sso.channelEmail',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  {
    id: 'SMS',
    label: 'sso.channelSms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
    ),
  },
  {
    id: 'WHATSAPP',
    label: 'sso.channelWhatsapp',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M3 21l1.6-4A8.5 8.5 0 1 1 8 19.4L3 21Z" />
        <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5" />
      </svg>
    ),
  },
]

// Client-side fallback masking (the API usually provides the masked value).
function maskEmail(value: string): string {
  const [local, domain] = value.split('@')
  if (!domain || !local) return value
  const head = local[0] ?? ''
  const tail = local.length > 1 ? local.slice(-1) : ''
  return `${head}${'•'.repeat(Math.max(2, local.length - 2))}${tail}@${domain}`
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 3) return value
  const last = digits.slice(-2)
  const lead = value.trim().startsWith('+') ? '+' : ''
  return `${lead}••• ••• •${last}`
}

export function ForgotPassword() {
  const navigate = useNavigate()
  const t = useT()

  const [step, setStep] = useState<Step>('channel')
  const [channel, setChannel] = useState<OtpChannel>('EMAIL')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [contactError, setContactError] = useState<MessageKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [maskedDest, setMaskedDest] = useState('')

  const isEmail = channel === 'EMAIL'
  const identifier = isEmail ? email.trim() : (phone ?? '')
  const validContact = isEmail ? isValidEmail(identifier) : isValidPhone(identifier)
  const pwOk = STRONG_PW.test(newPassword)

  useEffect(() => {
    if (step !== 'verify' || resendIn <= 0) return
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [step, resendIn])

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validContact) {
      setContactError(isEmail ? 'auth.invalidEmail' : 'auth.invalidPhone')
      return
    }
    setContactError(null)
    if (busy) return
    setBusy(true)
    const res = await dataClient.auth.requestPasswordReset(identifier, channel)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? t('forgot.sendError'))
      return
    }
    const masked = isEmail
      ? (res.context?.maskedEmail ?? maskEmail(identifier))
      : (res.context?.maskedPhone ?? maskPhone(identifier))
    setMaskedDest(masked)
    setCode('')
    setNewPassword('')
    setStep('verify')
    setResendIn(30)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (code.length !== 6) return
    if (!pwOk) {
      setError(t('forgot.weakPassword'))
      return
    }
    if (busy) return
    setBusy(true)
    const res = await dataClient.auth.resetPassword(identifier, code, newPassword)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? t('forgot.resetError'))
      return
    }
    toast.success(t('forgot.success'))
    navigate('/signin')
  }

  const resend = async () => {
    if (resendIn > 0 || busy) return
    await dataClient.auth.requestPasswordReset(identifier, channel)
    setResendIn(30)
  }

  const sentVia: MessageKey = isEmail
    ? 'sso.sentEmail'
    : channel === 'SMS'
      ? 'sso.sentSms'
      : 'sso.sentWhatsapp'
  const contactLabel: MessageKey = isEmail
    ? 'sso.emailLabel'
    : channel === 'WHATSAPP'
      ? 'sso.whatsappLabel'
      : 'sso.phoneLabel'
  const contactHint: MessageKey = isEmail
    ? 'sso.emailHint'
    : channel === 'SMS'
      ? 'sso.smsHint'
      : 'sso.whatsappHint'

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="mk">B</div>
        <div className="wm">BizTrack CM</div>
      </div>

      {step === 'channel' ? (
        <>
          <div className="auth-h">
            <div className="ey">{t('forgot.eyebrow')}</div>
            <h1>{t('forgot.title')}</h1>
            <p>{t('forgot.subtitle')}</p>
          </div>
          <form className="fform" onSubmit={sendCode}>
            <div className="ff">
              <label className="lbl2">{t('sso.sendVia')}</label>
              <span className="fseg">
                {CHANNELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={channel === c.id}
                    onClick={() => {
                      setChannel(c.id)
                      setContactError(null)
                    }}
                  >
                    {c.icon}
                    {t(c.label)}
                  </button>
                ))}
              </span>
            </div>

            <div className={`ff${contactError ? ' invalid' : ''}`}>
              <label className="lbl2">
                {t(contactLabel)} <span className="req">*</span>
              </label>
              {isEmail ? (
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
                    type="email"
                    placeholder="you@shop.cm"
                    value={email}
                    error={!!contactError}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setContactError(null)
                    }}
                  />
                </div>
              ) : (
                <PhoneInput
                  value={phone}
                  onChange={(v) => {
                    setPhone(v)
                    setContactError(null)
                  }}
                  error={!!contactError}
                  placeholder="6 91 22 14 08"
                />
              )}
              {contactError ? (
                <div className="msg err">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                  <span>{t(contactError)}</span>
                </div>
              ) : (
                <div className="hint">{t(contactHint)}</div>
              )}
            </div>

            {error ? (
              <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" block loading={busy}>
              {t('forgot.sendCode')}
            </Button>
          </form>

          <div className="auth-foot">
            <a onClick={() => navigate('/signin')} style={{ cursor: 'pointer' }}>
              {t('forgot.backToSignIn')}
            </a>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="auth-back" onClick={() => setStep('channel')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t('sso.changeChannel')}
          </button>
          <div className="auth-h">
            <h1>{t('forgot.enterTitle')}</h1>
            <p>
              {t(sentVia)} <b style={{ color: 'var(--text)' }}>{maskedDest}</b>.
            </p>
          </div>
          <form className="fform" onSubmit={submit}>
            <OtpInput value={code} onChange={setCode} error={!!error} />

            <div className="ff">
              <label className="lbl2">
                {t('forgot.newPassword')} <span className="req">*</span>
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
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    setError(null)
                  }}
                />
                <span className="trail">
                  <button
                    type="button"
                    className="eye"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((s) => !s)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </span>
              </div>
              <div className="hint">{t('forgot.newPasswordHint')}</div>
            </div>

            {error ? (
              <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              block
              loading={busy}
              disabled={code.length !== 6 || !pwOk}
            >
              {t('forgot.reset')}
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
        </>
      )}
    </div>
  )
}
