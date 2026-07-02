import { useState } from 'react'
import { Button, Input, OtpInput } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'

// Password & 2FA — PROTOTYPE. No backend wiring yet (password change + TOTP enrolment
// are auth flows). Everything is local so the flow can be reviewed.

const Info = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>)
const Warn = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>)
const Check = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="m5 12 4 4L19 6" /></svg>)
const Shield = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18 }}><path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5Z" /><path d="m9 12 2 2 4-4" /></svg>)

const SECRET = 'JBSW Y3DP EHPK 3PXP'

export function UserSecuritySection() {
  const t = useT()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [twofa, setTwofa] = useState(false)
  const [setup, setSetup] = useState(false)
  const [code, setCode] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((c) => (c === m ? null : c)), 2400) }

  const tooShort = next.length > 0 && next.length < 8
  const mismatch = confirm.length > 0 && next !== confirm
  const pwValid = cur.length > 0 && next.length >= 8 && next === confirm

  function savePw() {
    if (!pwValid) return
    setCur(''); setNext(''); setConfirm('')
    flash(t('sec.pwUpdated'))
  }
  function enable2fa() {
    if (code.replace(/\D/g, '').length !== 6) return
    setTwofa(true); setSetup(false); setCode('')
    flash(t('sec.2faEnabled'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="banner warn"><Warn /><span>{t('sec.comingSoon')}</span></div>

      {/* Change password */}
      <div className="card">
        <div className="card-h"><div><h3>{t('sec.pwTitle')}</h3><p>{t('sec.pwSub')}</p></div></div>
        <div className="ff"><label className="lbl2">{t('sec.current')}</label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className={`ff${tooShort ? ' invalid' : ''}`} style={{ marginTop: 12 }}>
          <label className="lbl2">{t('sec.new')}</label>
          <Input type="password" value={next} error={tooShort} onChange={(e) => setNext(e.target.value)} />
          <div className="help">{t('sec.pwMin')}</div>
        </div>
        <div className={`ff${mismatch ? ' invalid' : ''}`} style={{ marginTop: 12 }}>
          <label className="lbl2">{t('sec.confirm')}</label>
          <Input type="password" value={confirm} error={mismatch} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch ? (
            <div className="msg err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg><span>{t('sec.pwMismatch')}</span></div>
          ) : null}
        </div>
        <div className="fp-actions" style={{ marginTop: 16 }}>
          <Button variant="primary" type="button" disabled={!pwValid} onClick={savePw}>{t('sec.updatePw')}</Button>
        </div>
      </div>

      {/* Two-factor authentication */}
      <div className="card">
        <div className="card-h"><div><h3>{t('sec.2faTitle')}</h3><p>{t('sec.2faSub')}</p></div></div>
        <div className="set-line">
          <div>
            <div className="nm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: twofa ? 'var(--success)' : 'var(--text-muted)' }}><Shield /></span>
              {twofa ? t('sec.2faOn') : t('sec.2faOff')}
            </div>
            <div className="ds">{t('sec.2faSub')}</div>
          </div>
          {twofa ? (
            <Button variant="soft" type="button" onClick={() => { setTwofa(false); flash(t('sec.2faDisabled')) }}>{t('sec.disable')}</Button>
          ) : setup ? null : (
            <Button variant="primary" type="button" onClick={() => setSetup(true)}>{t('sec.setup')}</Button>
          )}
        </div>

        {setup && !twofa ? (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ width: 120, height: 120, flexShrink: 0, borderRadius: 10, background: 'conic-gradient(from 0deg,#000 25%,#fff 0 50%,#000 0 75%,#fff 0) 0 0/24px 24px, #fff', border: '6px solid #fff', outline: '1px solid var(--border)' }} />
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 10 }}>{t('sec.scan')}</div>
                <div className="lbl2">{t('sec.secretKey')}</div>
                <div className="tcode" style={{ display: 'inline-block', marginTop: 4, letterSpacing: '.08em' }}>{SECRET}</div>
              </div>
            </div>
            <div className="ff" style={{ marginTop: 16 }}>
              <label className="lbl2">{t('sec.enterCode')}</label>
              <OtpInput value={code} onChange={setCode} onComplete={enable2fa} autoFocus={false} />
            </div>
            <div className="form-note"><Info /><span>{t('sec.recoveryNote')}</span></div>
            <div className="fp-actions" style={{ marginTop: 14 }}>
              <Button variant="soft" type="button" onClick={() => { setSetup(false); setCode('') }}>{t('sec.cancel')}</Button>
              <Button variant="primary" type="button" disabled={code.replace(/\D/g, '').length !== 6} onClick={enable2fa}>{t('sec.verifyEnable')}</Button>
            </div>
          </div>
        ) : null}
      </div>

      {toast ? (
        <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: 'var(--success)', display: 'inline-flex' }}><Check /></span>{toast}
        </div>
      ) : null}
    </div>
  )
}
