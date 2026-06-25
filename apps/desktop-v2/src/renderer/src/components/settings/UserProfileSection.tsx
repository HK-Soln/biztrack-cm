import { useEffect, useState } from 'react'
import { Button, Input, OtpInput, PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useSessionStore } from '@/stores/session.store'
import { isValidEmail } from '@/lib/schemas'

// User personal data — PROTOTYPE. Name edits are local. Email/phone are sign-in
// identifiers, so a change must pass a verification (OTP) step before it commits —
// this models that auth flow locally (no real codes are sent yet).

function initials(name?: string | null): string {
  if (!name) return '—'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

const Info = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>)
const Warn = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>)
const Check = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="m5 12 4 4L19 6" /></svg>)

type Verify = { field: 'email' | 'phone'; value: string }

export function UserProfileSection() {
  const t = useT()
  const user = useSessionStore((s) => s.status.user)

  const [name, setName] = useState(user?.name ?? '')
  const [savedName, setSavedName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [savedEmail, setSavedEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [savedPhone, setSavedPhone] = useState(user?.phone ?? '')

  const [verify, setVerify] = useState<Verify | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((c) => (c === m ? null : c)), 2400) }

  const nameDirty = name.trim() !== savedName.trim() && name.trim().length > 0
  const emailChanged = email.trim() !== (savedEmail ?? '').trim()
  const emailOk = emailChanged && isValidEmail(email.trim())
  const phoneChanged = (phone || '') !== (savedPhone ?? '')
  // Any valid (SMS/WhatsApp-capable) number — not Cameroon-specific on this page.
  const phoneOk = phoneChanged && isValidPhone(phone)

  function onVerified() {
    if (!verify) return
    if (verify.field === 'email') { setSavedEmail(verify.value); flash(t('prof.emailUpdated')) }
    else { setSavedPhone(verify.value); flash(t('prof.phoneUpdated')) }
    setVerify(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="banner warn"><Warn /><span>{t('prof.comingSoon')}</span></div>

      {/* Identity */}
      <div className="card">
        <div className="card-h"><div><h3>{t('prof.identityTitle')}</h3><p>{t('prof.identitySub')}</p></div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand-int)', display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 700, flexShrink: 0 }}>{initials(name || user?.name)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 650 }}>{name || user?.name || '—'}</div>
            {user?.role ? <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t('prof.role')} · {user.role}</div> : null}
          </div>
        </div>
        <div className="ff">
          <label className="lbl2">{t('prof.name')}</label>
          <Input value={name} placeholder="Henson Amah" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fp-actions" style={{ marginTop: 16 }}>
          <Button variant="soft" type="button" disabled={!nameDirty} onClick={() => setName(savedName)}>{t('prof.cancel')}</Button>
          <Button variant="primary" type="button" disabled={!nameDirty} onClick={() => { setSavedName(name); flash(t('prof.saved')) }}>{t('prof.save')}</Button>
        </div>
      </div>

      {/* Contact (verified) */}
      <div className="card">
        <div className="card-h"><div><h3>{t('prof.contactTitle')}</h3><p>{t('prof.contactSub')}</p></div></div>
        <div className="ff">
          <label className="lbl2">{t('prof.email')}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <Input type="email" value={email} placeholder="you@business.cm" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button variant="soft" type="button" disabled={!emailOk} onClick={() => setVerify({ field: 'email', value: email.trim() })}>{t('prof.verify')}</Button>
          </div>
        </div>
        <div className="ff" style={{ marginTop: 12 }}>
          <label className="lbl2">{t('prof.phone')}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <PhoneInput value={phone || undefined} defaultCountry="CM" placeholder="6 78 22 14 02" onChange={(v) => setPhone(v ?? '')} />
            </div>
            <Button variant="soft" type="button" disabled={!phoneOk} onClick={() => setVerify({ field: 'phone', value: phone })}>{t('prof.verify')}</Button>
          </div>
        </div>
        <div className="form-note"><Info /><span>{t('prof.verifyNote')}</span></div>
      </div>

      {verify ? <VerifyModal verify={verify} onCancel={() => setVerify(null)} onVerified={onVerified} /> : null}

      {toast ? (
        <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: 'var(--success)', display: 'inline-flex' }}><Check /></span>{toast}
        </div>
      ) : null}
    </div>
  )
}

function VerifyModal({ verify, onCancel, onVerified }: { verify: Verify; onCancel: () => void; onVerified: () => void }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [secs, setSecs] = useState(45)
  useEffect(() => {
    if (secs <= 0) return
    const id = window.setTimeout(() => setSecs((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [secs])
  const whatKey: MessageKey = verify.field === 'email' ? 'prof.verifyEmail' : 'prof.verifyPhone'
  const ok = code.replace(/\D/g, '').length === 6
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 400 }}>
        <div className="modal-head"><h2>{t('prof.verifyTitle').replace('{what}', t(whatKey))}</h2></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('prof.otpSent').replace('{dest}', verify.value)}</div>
          <OtpInput value={code} onChange={setCode} onComplete={onVerified} />
          <button
            type="button"
            disabled={secs > 0}
            style={{ alignSelf: 'flex-start', background: 'none', border: 0, color: secs > 0 ? 'var(--text-muted)' : 'var(--brand-int)', font: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: secs > 0 ? 'default' : 'pointer' }}
            onClick={() => { setSecs(45); setCode('') }}
          >
            {secs > 0 ? t('prof.resendIn').replace('{t}', mmss) : t('prof.resend')}
          </button>
        </div>
        <div className="modal-foot">
          <Button variant="soft" type="button" onClick={onCancel}>{t('prof.cancel')}</Button>
          <Button variant="primary" type="button" disabled={!ok} onClick={onVerified}>{t('prof.confirm')}</Button>
        </div>
      </div>
    </div>
  )
}
