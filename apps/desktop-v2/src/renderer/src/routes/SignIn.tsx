import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import { useSessionStore } from '@/stores/session.store'

// Feature 1: minimally wired to the BFF (password login) so the auth gate works
// end-to-end. The full designed sign-in (OTP/"SSO" tabs, validation, offline) is
// built in Feature 2.
export function SignIn() {
  const navigate = useNavigate()
  const t = useT()
  const setStatus = useSessionStore((s) => s.setStatus)
  const [showPw, setShowPw] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !window.api?.auth) return
    setBusy(true)
    setError(null)
    const res = await window.api.auth.login(identifier.trim(), password)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Sign in failed.')
      return
    }
    setStatus(res.session)
    if (res.session.authenticated) {
      navigate('/')
    } else {
      // phase1 — needs business selection (built in the Select business feature).
      setError('Signed in — business selection screen is coming next.')
    }
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
        <div className="ff">
          <label className="lbl2" htmlFor="i-id">
            {t('auth.emailOrPhone')}
          </label>
          <div className="inwrap has-lead">
            <svg className="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <Input
              id="i-id"
              placeholder="you@shop.cm · 6 91 22 14 08"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
        </div>

        <div className="ff">
          <label className="lbl2" htmlFor="i-pw">
            {t('auth.password')}
            <a className="opt" href="#" style={{ color: 'var(--brand-int)', textDecoration: 'none' }}>
              {t('auth.forgot')}
            </a>
          </label>
          <div className="inwrap has-lead">
            <svg className="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <Input
              id="i-pw"
              type={showPw ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
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
        </div>

        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
            {error}
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

      <div className="or">{t('auth.orContinue')}</div>
      <div className="oauth">
        <button type="button">
          <span className="g mtn">M</span>
          {t('auth.continueMtn')}
        </button>
        <button type="button">
          <span className="g" style={{ background: '#4285F4' }}>
            G
          </span>
          {t('auth.continueGoogle')}
        </button>
      </div>

      <div className="auth-foot">
        {t('auth.newToBiztrack')} <a href="#">{t('auth.createBusiness')}</a>
      </div>
    </div>
  )
}
