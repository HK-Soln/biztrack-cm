import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { BusinessOption } from '@shared/ipc'
import { useSessionStore } from '@/stores/session.store'
import { routeForNextStep } from '@/lib/auth-routing'

const ROLE_KEY: Record<string, MessageKey> = {
  OWNER: 'selectBiz.role.owner',
  MANAGER: 'selectBiz.role.manager',
  CASHIER: 'selectBiz.role.cashier',
  ACCOUNTANT: 'selectBiz.role.accountant',
}

const isOwner = (b: BusinessOption): boolean => (b.role ?? '').toUpperCase() === 'OWNER'
// Known to be mid-setup (status present and not ACTIVE). null status = unknown
// (offline) → not flagged; the backend stays the authority.
const isIncomplete = (b: BusinessOption): boolean => !!b.status && b.status !== 'ACTIVE'
// A non-owner can't enter a business that isn't set up — mirror the backend guard
// in the UI so the row is disabled with a reason instead of erroring on click.
const isLocked = (b: BusinessOption): boolean => isIncomplete(b) && !isOwner(b)

// Phase1 → phase2: a logged-in (phase1) user picks which business to open. We list
// the businesses they belong to and call selectBusiness, which mints the phase2
// token and returns the onboarding/dashboard nextStep. Works offline — listBusinesses
// falls back to the local cache when the API is unreachable.
export function SelectBusiness() {
  const navigate = useNavigate()
  const t = useT()
  const setStatus = useSessionStore((s) => s.setStatus)
  const logout = useSessionStore((s) => s.logout)

  const [businesses, setBusinesses] = useState<BusinessOption[] | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoTried = useRef(false)

  const signOut = async () => {
    await logout()
    navigate('/signin', { replace: true })
  }

  const select = async (id: string) => {
    if (selecting || !window.api?.auth) return
    setSelecting(id)
    setError(null)
    const res = await window.api.auth.selectBusiness(id)
    if (!res.ok) {
      setSelecting(null)
      setError(res.error ?? t('selectBiz.error'))
      return
    }
    setStatus(res.session)
    navigate(routeForNextStep(res.nextStep))
  }

  useEffect(() => {
    let active = true
    if (!window.api?.auth) {
      setBusinesses([])
      return
    }
    void window.api.auth.listBusinesses().then((list) => {
      if (!active) return
      setBusinesses(list)
      // One business the user can actually enter → skip the picker and open it.
      // Never auto-open a locked (non-owner, not-set-up) business.
      if (list.length === 1 && !autoTried.current && !isLocked(list[0]!)) {
        autoTried.current = true
        void select(list[0]!.id)
      }
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const roleLabel = (role: string | null): string =>
    role ? t(ROLE_KEY[role.toUpperCase()] ?? 'selectBiz.role.member') : t('selectBiz.role.member')

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="mk">B</div>
        <div className="wm">BizTrack CM</div>
      </div>

      <div className="auth-h">
        <div className="ey">{t('selectBiz.eyebrow')}</div>
        <h1>{t('selectBiz.title')}</h1>
        <p>{t('selectBiz.subtitle')}</p>
      </div>

      {businesses === null ? (
        <div className="biz-empty">{t('selectBiz.loading')}</div>
      ) : businesses.length === 0 ? (
        <>
          <div className="biz-empty">{t('selectBiz.empty')}</div>
          <Button variant="primary" block onClick={() => navigate('/signup')}>
            {t('selectBiz.createBusiness')}
          </Button>
        </>
      ) : (
        <div className="biz-list">
          {businesses.map((b) => {
            const locked = isLocked(b)
            return (
              <button
                key={b.id}
                type="button"
                className={`biz-item${locked ? ' locked' : ''}`}
                disabled={!!selecting || locked}
                onClick={() => void select(b.id)}
              >
                <span className="ava">{b.name.trim().charAt(0) || 'B'}</span>
                <span className="meta">
                  <span className="nm">{b.name}</span>
                  <span className="rl">{locked ? t('selectBiz.askOwner') : roleLabel(b.role)}</span>
                </span>
                {isIncomplete(b) ? <span className="biz-badge">{t('selectBiz.setupIncomplete')}</span> : null}
                {selecting === b.id ? (
                  <span className="spin" aria-hidden />
                ) : locked ? (
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                ) : (
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="auth-foot">
        <a onClick={() => void signOut()} style={{ cursor: 'pointer' }}>
          {t('onboarding.signOut')}
        </a>
      </div>
    </div>
  )
}
