import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, PhoneInput, Select } from '@biztrack/ui/biztrack'
import { FileUpload } from '@/components/FileUpload'
import { dataClient } from '@/lib/data-client'
import { useT, useLangStore } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useCurrency } from '@/lib/currency'
import { useSessionStore } from '@/stores/session.store'
import { isValidEmail } from '@/lib/schemas'
import { errorMessage } from '@/lib/error'
import { BusinessType, type BusinessProfile, type UpdateBusinessRequest } from '@shared/ipc'
import { SubscriptionSection } from '@/components/settings/SubscriptionSection'
import { BillingSection } from '@/components/settings/BillingSection'
import { TaxSection } from '@/components/settings/TaxSection'

// Settings is a SINGLE route with an in-page side-nav (per design-settings.html).
// Team & Roles live under the separate "Organization" nav group — they are not
// settings. Business-level settings (profile, subscription, billing, tax) are
// ONLINE-ONLY by design: they write straight to the API so changes propagate to
// every user immediately (no offline edit / no local cache write). Per-user prefs
// (appearance, language) stay local.

type SectionKey =
  | 'business'
  | 'security'
  | 'subscription'
  | 'billing'
  | 'tax'
  | 'receipts'
  | 'notifications'

const ICO: Record<string, ReactNode> = {
  building: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01" /></svg>,
  palette: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17" cy="11" r="1.5" /><circle cx="8" cy="7.5" r="1.5" /><circle cx="6.5" cy="12" r="1.5" /><path d="M12 22a10 10 0 0 1 0-20c5 0 8 3 8 7 0 3-3 4-5 4h-2a2 2 0 0 0 0 4 2 2 0 0 1-1 5Z" /></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5Z" /></svg>,
  card: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>,
  receipt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" /><path d="M8 8h8M8 12h8" /></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></svg>,
  scale: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M9 9h6M9 12h6M9 15h3" /></svg>,
  lock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="m5 12 4 4L19 6" /></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>,
}

const NAV_GROUPS: Array<{
  label: MessageKey
  items: Array<{ key: SectionKey; label: MessageKey; icon: ReactNode }>
}> = [
  {
    label: 'settings.grpBusiness',
    items: [{ key: 'business', label: 'settings.business', icon: ICO.building }],
  },
  {
    label: 'settings.grpAccount',
    items: [
      { key: 'security', label: 'settings.security', icon: ICO.lock },
      { key: 'subscription', label: 'settings.subscription', icon: ICO.shield },
      { key: 'billing', label: 'settings.billing', icon: ICO.card },
      { key: 'tax', label: 'settings.tax', icon: ICO.scale },
      { key: 'receipts', label: 'settings.receipts', icon: ICO.receipt },
    ],
  },
  {
    label: 'settings.grpPreferences',
    items: [
      { key: 'notifications', label: 'settings.notifications', icon: ICO.bell },
    ],
  },
]

const SECTION_LABEL: Record<SectionKey, MessageKey> = {
  business: 'settings.business',
  security: 'settings.security',
  subscription: 'settings.subscription',
  billing: 'settings.billing',
  tax: 'settings.tax',
  receipts: 'settings.receipts',
  notifications: 'settings.notifications',
}

const SECTION_KEYS: SectionKey[] = ['business', 'security', 'subscription', 'billing', 'tax', 'receipts', 'notifications']

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function Settings() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const initial = params.get('section')
  const [section, setSection] = useState<SectionKey>(
    initial && (SECTION_KEYS as string[]).includes(initial) ? (initial as SectionKey) : 'business',
  )

  function selectSection(key: SectionKey) {
    setSection(key)
    setParams(key === 'business' ? {} : { section: key }, { replace: true })
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="settings">
        <nav className="set-nav">
          {NAV_GROUPS.map((g) => (
            <Fragment key={g.label}>
              <div className="grp-l">{t(g.label)}</div>
              {g.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={section === it.key ? 'active' : undefined}
                  onClick={() => selectSection(it.key)}
                >
                  {it.icon}
                  <span>{t(it.label)}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </nav>

        <div>
          {section === 'business' ? (
            <BusinessProfileSection />
          ) : section === 'security' ? (
            <BusinessSecuritySection />
          ) : section === 'subscription' ? (
            <SubscriptionSection onManageBilling={() => selectSection('billing')} />
          ) : section === 'billing' ? (
            <BillingSection />
          ) : section === 'tax' ? (
            <TaxSection />
          ) : (
            <SectionStub titleKey={SECTION_LABEL[section]} />
          )}
        </div>
      </div>
    </div>
  )
}

// Business-level security policy (org-wide). Prototype: the require-2FA toggle is
// local for now; per-role 2FA is decided when creating/editing a role (Organization →
// Roles & permissions). No backend enforcement yet.
function BusinessSecuritySection() {
  const t = useT()
  const [require2fa, setRequire2fa] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span>{t('bsec.comingSoon')}</span>
      </div>
      <div className="card">
        <div className="fsec-h">{t('bsec.title')}</div>
        <div className="set-line">
          <div><div className="nm">{t('bsec.require')}</div><div className="ds">{t('bsec.requireDesc')}</div></div>
          <button type="button" className={`switch${require2fa ? ' on' : ''}`} aria-pressed={require2fa} onClick={() => setRequire2fa((v) => !v)} />
        </div>
        <div className="form-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
          <span>{t('bsec.roleNote')}</span>
        </div>
      </div>
    </div>
  )
}

function SectionStub({ titleKey }: { titleKey: MessageKey }) {
  const t = useT()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span>{t('settings.soonBanner')}</span>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>{t(titleKey)}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t('settings.soonDesc')}</div>
      </div>
    </div>
  )
}

const BUSINESS_TYPES = Object.values(BusinessType)

type FormState = {
  name: string
  type: BusinessType
  description: string
  phone: string
  email: string
  address: string
  city: string
  logoUrl: string
}

function toForm(p: BusinessProfile): FormState {
  return {
    name: p.name ?? '',
    type: (p.type as BusinessType) ?? BusinessType.BOUTIQUE,
    description: p.description ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
    city: p.city ?? '',
    logoUrl: p.logoUrl ?? '',
  }
}

function isDirty(f: FormState, p: BusinessProfile): boolean {
  return (
    f.name.trim() !== (p.name ?? '') ||
    f.type !== ((p.type as BusinessType) ?? BusinessType.BOUTIQUE) ||
    f.description.trim() !== (p.description ?? '') ||
    (f.phone || '') !== (p.phone ?? '') ||
    f.email.trim() !== (p.email ?? '') ||
    f.address.trim() !== (p.address ?? '') ||
    f.city.trim() !== (p.city ?? '') ||
    (f.logoUrl || '') !== (p.logoUrl ?? '')
  )
}

function BusinessProfileSection() {
  const t = useT()
  const qc = useQueryClient()
  const online = useOnline()
  const cur = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const refreshSession = useSessionStore((s) => s.refresh)

  const q = useQuery({ queryKey: ['business', 'profile'], queryFn: () => dataClient.business.getProfile() })

  const [form, setForm] = useState<FormState | null>(null)
  const [nameErr, setNameErr] = useState(false)
  const [emailErr, setEmailErr] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (q.data) setForm(toForm(q.data))
  }, [q.data])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  const isOwner = q.data?.role === 'OWNER'
  const canEdit = isOwner && online
  const dirty = useMemo(() => (form && q.data ? isDirty(form, q.data) : false), [form, q.data])

  const save = useMutation({
    mutationFn: () => {
      const f = form as FormState
      const dto: UpdateBusinessRequest = {
        name: f.name.trim(),
        type: f.type,
        description: f.description.trim() || undefined,
        phone: f.phone || undefined,
        email: f.email.trim() || undefined,
        address: f.address.trim() || undefined,
        city: f.city.trim() || undefined,
        logoUrl: f.logoUrl || null,
      }
      return dataClient.business.update(dto)
    },
    onSuccess: (updated) => {
      setToast(t('settings.bp.saved'))
      // The /businesses/setup response is the Business entity — it carries no
      // membership role, so keep the role we already loaded (otherwise the form
      // would think the owner is no longer an owner and freeze).
      qc.setQueryData<BusinessProfile | null>(['business', 'profile'], (prev) => ({
        ...updated,
        role: prev?.role ?? updated.role,
      }))
      void refreshSession() // sidebar/topbar business name may have changed
    },
    onError: (e) => setError(errorMessage(e, t('settings.bp.saveError'))),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !canEdit) return
    setError(null)
    const nm = !form.name.trim()
    const em = !!form.email.trim() && !isValidEmail(form.email.trim())
    setNameErr(nm)
    setEmailErr(em)
    if (nm || em) return
    save.mutate()
  }

  if (q.isLoading || !form) {
    return <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>…</div>
  }
  if (q.isError) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12 }}>{t('settings.bp.loadError')}</div>
        <Button variant="soft" type="button" onClick={() => void q.refetch()}>{t('settings.bp.retry')}</Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!online ? (
        <div className="banner warn">{ICO.warn}<span>{t('settings.bp.onlineOnly')}</span></div>
      ) : !isOwner ? (
        <div className="banner">{ICO.shield}<span>{t('settings.bp.ownerOnly')}</span></div>
      ) : null}

      <div className="fp-grid">
        {/* Main column: identity + contact */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="fsec-h"><span className="n">1</span>{t('settings.bp.identity')}</div>
            <div className="fform">
              <div className={`ff${nameErr ? ' invalid' : ''}`}>
                <label className="lbl2">{t('settings.bp.name')} <span className="req">*</span></label>
                <Input
                  value={form.name}
                  error={nameErr}
                  disabled={!canEdit}
                  placeholder={t('settings.bp.namePh')}
                  onChange={(e) => {
                    set('name', e.target.value)
                    if (nameErr) setNameErr(false)
                  }}
                />
                {nameErr ? (
                  <div className="msg err">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                    <span>{t('settings.bp.nameRequired')}</span>
                  </div>
                ) : null}
              </div>
              <div className="ff">
                <label className="lbl2">{t('settings.bp.type')}</label>
                <Select
                  value={form.type}
                  disabled={!canEdit}
                  onChange={(e) => set('type', e.target.value as BusinessType)}
                  options={BUSINESS_TYPES.map((v) => ({ value: v, label: t(`bizType.${v}` as MessageKey) }))}
                />
              </div>
              <div className="ff">
                <label className="lbl2">{t('settings.bp.slogan')} <span className="opt">{t('settings.bp.optional')}</span></label>
                <Input value={form.description} disabled={!canEdit} placeholder={t('settings.bp.sloganPh')} onChange={(e) => set('description', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="fsec-h"><span className="n">2</span>{t('settings.bp.contact')}</div>
            <div className="fform">
              <div className="ff">
                <label className="lbl2">{t('settings.bp.phone')}</label>
                <PhoneInput value={form.phone || undefined} disabled={!canEdit} placeholder="6 91 22 14 08" onChange={(v) => set('phone', v ?? '')} />
              </div>
              <div className={`ff${emailErr ? ' invalid' : ''}`}>
                <label className="lbl2">{t('settings.bp.email')}</label>
                <Input
                  type="email"
                  value={form.email}
                  error={emailErr}
                  disabled={!canEdit}
                  placeholder="contact@boutique.cm"
                  onChange={(e) => {
                    set('email', e.target.value)
                    if (emailErr) setEmailErr(false)
                  }}
                />
                {emailErr ? (
                  <div className="msg err">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                    <span>{t('settings.bp.emailInvalid')}</span>
                  </div>
                ) : null}
              </div>
              <div className="ff-row">
                <div className="ff">
                  <label className="lbl2">{t('settings.bp.address')}</label>
                  <Input value={form.address} disabled={!canEdit} onChange={(e) => set('address', e.target.value)} />
                </div>
                <div className="ff">
                  <label className="lbl2">{t('settings.bp.city')}</label>
                  <Input value={form.city} disabled={!canEdit} onChange={(e) => set('city', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Side rail: logo + preferences */}
        <div className="fp-side">
          <div className="card">
            <div className="fsec-h">{t('settings.bp.logo')}</div>
            <FileUpload
              variant="image"
              value={form.logoUrl || null}
              onChange={(url) => set('logoUrl', url ?? '')}
              folder="business"
              disabled={!canEdit}
              label={t('settings.bp.logoCta')}
              hint={t('settings.bp.logoHint')}
            />
          </div>

          <div className="card">
            <div className="fsec-h">{t('settings.bp.preferences')}</div>
            <div className="ff">
              <label className="lbl2">{t('settings.bp.currency')}</label>
              <Input value={`${cur.symbol} (${cur.currency})`} disabled readOnly />
              <div className="help">{t('settings.bp.currencyHint')}</div>
            </div>
            <div className="ff" style={{ marginTop: 14 }}>
              <label className="lbl2">{t('settings.bp.language')}</label>
              <div>
                <span className="seg-pick">
                  <button type="button" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>FR</button>
                  <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="banner warn">{ICO.warn}<span>{error}</span></div> : null}

      <div className="fp-actions" style={{ alignItems: 'center' }}>
        {toast ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
            {ICO.check}{toast}
          </span>
        ) : null}
        <Button variant="soft" type="button" disabled={!canEdit || !dirty || save.isPending} onClick={() => setForm(toForm(q.data!))}>
          {t('settings.bp.cancel')}
        </Button>
        <Button variant="primary" type="submit" loading={save.isPending} disabled={!canEdit || !dirty}>
          {t('settings.bp.save')}
        </Button>
      </div>
    </form>
  )
}
