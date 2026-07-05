import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { useSessionStore } from '@/stores/session.store'
import { STORE_ROOT_DOMAIN } from '@/lib/config'
import { useT } from '@/i18n'
import { errorMessage } from '@/lib/error'
import { OnlineError, OnlineUpsell, isPlanUpgrade } from '@/components/online/OnlineStates'
import { FileUpload } from '@/components/FileUpload'
import type {
  OnlineStore as Store,
  OnlineStoreAppearance,
  OnlineStoreLayout,
  UpdateOnlineStoreRequest,
} from '@shared/ipc'

const RESERVED = [
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'cdn',
  'store',
  'shop',
  'help',
  'status',
  'static',
  'assets',
  'blog',
]
const THEMES: Array<{ id: string; name: string; brand: string }> = [
  { id: 'a', name: 'Ink Blue', brand: '#16467A' },
  { id: 'b', name: 'Slate Teal', brand: '#0F5C5C' },
  { id: 'c', name: 'Graphite', brand: '#33332F' },
  { id: 'd', name: 'Indigo', brand: '#4A3F94' },
]
const LAYOUTS: OnlineStoreLayout[] = ['classic', 'boutique', 'catalog', 'landing']

// Distinct wireframe per template (matches design-store-config): classic = hero + 2×2 grid,
// boutique = centered bar + hero + categories pill + grid, catalog = dense rows, landing =
// big hero + CTA. Purely illustrative thumbnails.
function templateWire(tpl: OnlineStoreLayout) {
  switch (tpl) {
    case 'classic':
      return (
        <>
          <div className="wbar" />
          <div className="whero" style={{ height: 22 }} />
          <div className="wrow">
            <div className="wb" />
            <div className="wb" />
          </div>
          <div className="wrow">
            <div className="wb" />
            <div className="wb" />
          </div>
        </>
      )
    case 'boutique':
      return (
        <>
          <div className="wbar c" />
          <div className="whero" style={{ height: 20 }} />
          <div className="wpill" />
          <div className="wrow">
            <div className="wb" />
            <div className="wb" />
          </div>
        </>
      )
    case 'catalog':
      return (
        <>
          <div className="wbar" />
          <div className="wpill" />
          <div className="wb" style={{ height: 11 }} />
          <div className="wb" style={{ height: 11 }} />
          <div className="wb" style={{ height: 11 }} />
        </>
      )
    case 'landing':
      return (
        <>
          <div className="wbar" />
          <div className="whero" style={{ height: 30 }} />
          <div className="wpill" />
          <div className="wb" style={{ height: 14 }} />
        </>
      )
  }
}

const ICO = {
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  palette: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="13.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="10.5" r="2.5" />
      <circle cx="8.5" cy="7.5" r="2.5" />
      <circle cx="6.5" cy="12.5" r="2.5" />
      <path d="M12 22a10 10 0 0 1 0-20c5 0 8 3 8 7 0 3-3 4-5 4h-2a2 2 0 0 0 0 4 2 2 0 0 1-1 5Z" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  ),
  rocket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
}

// Social platform glyphs (leading icon per profile field).
const SOC = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 9V7c0-1 .5-2 2-2h2V2h-3c-2.5 0-4 1.6-4 4v3H8v3h3v8h3v-8h2.5l.5-3Z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M17.5 3h3l-7 8 8.2 10h-6.4l-5-6.1L8 21H5l7.4-8.5L4.5 3h6.5l4.5 5.6L17.5 3Zm-1.1 16h1.7L8 4.8H6.2L16.4 19Z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 17v-7" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 21l1.6-5A8 8 0 1 1 8 19.4L3 21Z" />
      <path d="M8.5 9.5c.5 3 3 5.5 6 6" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 4v9a4 4 0 1 1-3-3.9" />
      <path d="M14 4a5 5 0 0 0 5 5" />
    </svg>
  ),
}

type Form = {
  storeName: string
  storeSlug: string
  layoutTemplate: OnlineStoreLayout
  themeId: string
  appearance: OnlineStoreAppearance
  catalogBinding: 'snapshot' | 'live'
  showOutOfStock: boolean
  showLowStockBadges: boolean
  seoTitle: string
  seoDescription: string
  ogImageUrl: string
  robotsIndex: boolean
  socialInstagram: string
  socialFacebook: string
  socialX: string
  socialLinkedin: string
  whatsappNumber: string
  socialTiktok: string
}
function toForm(s: Store): Form {
  return {
    storeName: s.storeName,
    storeSlug: s.storeSlug,
    layoutTemplate: s.layoutTemplate,
    themeId: s.themeId,
    appearance: s.appearance,
    catalogBinding: s.catalogBinding,
    showOutOfStock: s.showOutOfStock,
    showLowStockBadges: s.showLowStockBadges,
    seoTitle: s.seoTitle ?? '',
    seoDescription: s.seoDescription ?? '',
    ogImageUrl: s.ogImageUrl ?? '',
    robotsIndex: s.robotsIndex,
    socialInstagram: s.socialInstagram ?? '',
    socialFacebook: s.socialFacebook ?? '',
    socialX: s.socialX ?? '',
    socialLinkedin: s.socialLinkedin ?? '',
    whatsappNumber: s.whatsappNumber ?? '',
    socialTiktok: s.socialTiktok ?? '',
  }
}

export function OnlineStore() {
  const t = useT()
  const qc = useQueryClient()
  const store = useQuery({
    queryKey: ['online', 'store'],
    queryFn: () => dataClient.online.getStore(),
    enabled: true,
    retry: false,
  })

  if (store.error && isPlanUpgrade(store.error)) return <OnlineUpsell />
  if (store.error)
    return (
      <div className="frame">
        <OnlineError error={store.error} onRetry={() => store.refetch()} />
      </div>
    )
  if (store.isPending)
    return (
      <div className="frame">
        <p className="hint" style={{ padding: 24 }}>
          {t('online.loading')}
        </p>
      </div>
    )
  if (!store.data)
    return (
      <CreateStore
        t={t}
        onCreated={() => qc.invalidateQueries({ queryKey: ['online', 'store'] })}
      />
    )

  return (
    <StoreConfig
      store={store.data}
      t={t}
      onSaved={() => qc.invalidateQueries({ queryKey: ['online', 'store'] })}
    />
  )
}

// --- first-run: no store yet ----------------------------------------------
function CreateStore({ t, onCreated }: { t: ReturnType<typeof useT>; onCreated: () => void }) {
  // Prefill from the business name captured at onboarding (the rest is seeded server-side).
  const businessName = useSessionStore((s) => s.status.businessName)
  const [name, setName] = useState(businessName ?? '')
  const [error, setError] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: () => dataClient.online.createStore({ storeName: name.trim() }),
    onSuccess: onCreated,
    onError: (e) => setError(errorMessage(e, t('online.saveError'))),
  })
  const submit = () => {
    if (!name.trim()) {
      setError(t('online.nameRequired'))
      return
    }
    setError(null)
    create.mutate()
  }
  return (
    <div className="frame">
      <form
        className="online-gate"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="online-gate-ic">{ICO.globe}</div>
        <h2>{t('online.createTitle')}</h2>
        <p>{t('online.createBody')}</p>
        <div style={{ width: 320, maxWidth: '100%' }}>
          <Input
            value={name}
            placeholder={t('online.storeNamePlaceholder')}
            autoFocus
            error={!!error}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
        </div>
        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t('online.createCta')}
        </Button>
      </form>
    </div>
  )
}

// --- store configuration ---------------------------------------------------
function StoreConfig({
  store,
  t,
  onSaved,
}: {
  store: Store
  t: ReturnType<typeof useT>
  onSaved: () => void
}) {
  const [form, setForm] = useState<Form>(() => toForm(store))
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    setForm(toForm(store))
  }, [store])
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const brand = THEMES.find((x) => x.id === form.themeId)?.brand ?? '#16467A'
  const host = `${form.storeSlug || 'yourshop'}.${STORE_ROOT_DOMAIN}`

  // Live availability: instant client checks (empty/format/reserved), then a debounced
  // server check for uniqueness (skipped while the slug equals the store's current one).
  const [debouncedSlug, setDebouncedSlug] = useState(form.storeSlug)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSlug(form.storeSlug), 350)
    return () => clearTimeout(id)
  }, [form.storeSlug])
  const isOwnSlug = debouncedSlug.trim().toLowerCase() === store.storeSlug.toLowerCase()
  const localReserved = RESERVED.includes(debouncedSlug.trim().toLowerCase())
  const slugCheck = useQuery({
    queryKey: ['online', 'slug-check', debouncedSlug],
    queryFn: () => dataClient.online.checkSlug(debouncedSlug.trim()),
    enabled: isElectron && !!debouncedSlug.trim() && !isOwnSlug && !localReserved,
    retry: false,
  })
  const slugState = useMemo<{ ok: boolean; msg: string; checking?: boolean }>(() => {
    const v = form.storeSlug.trim().toLowerCase()
    if (!v) return { ok: false, msg: t('online.slugEmpty') }
    if (RESERVED.includes(v))
      return { ok: false, msg: t('online.slugReserved').replace('{slug}', v) }
    if (isOwnSlug) return { ok: true, msg: t('online.slugAvailable') }
    if (v !== debouncedSlug.trim().toLowerCase() || slugCheck.isFetching)
      return { ok: true, checking: true, msg: t('online.slugChecking') }
    const r = slugCheck.data
    if (!r) return { ok: true, checking: true, msg: t('online.slugChecking') }
    if (r.available) return { ok: true, msg: t('online.slugAvailable') }
    if (r.reason === 'taken') return { ok: false, msg: t('online.slugTaken') }
    if (r.reason === 'reserved')
      return { ok: false, msg: t('online.slugReserved').replace('{slug}', v) }
    return { ok: false, msg: t('online.slugInvalid') }
  }, [form.storeSlug, debouncedSlug, isOwnSlug, slugCheck.isFetching, slugCheck.data, t])

  const save = useMutation({
    mutationFn: () => {
      const dto: UpdateOnlineStoreRequest = {
        storeName: form.storeName.trim(),
        storeSlug: form.storeSlug.trim(),
        layoutTemplate: form.layoutTemplate,
        themeId: form.themeId,
        primaryColor: brand,
        appearance: form.appearance,
        catalogBinding: form.catalogBinding,
        showOutOfStock: form.showOutOfStock,
        showLowStockBadges: form.showLowStockBadges,
        seoTitle: form.seoTitle.trim() || null,
        seoDescription: form.seoDescription.trim() || null,
        ogImageUrl: form.ogImageUrl.trim() || null,
        robotsIndex: form.robotsIndex,
        socialInstagram: form.socialInstagram.trim() || null,
        socialFacebook: form.socialFacebook.trim() || null,
        socialX: form.socialX.trim() || null,
        socialLinkedin: form.socialLinkedin.trim() || null,
        whatsappNumber: form.whatsappNumber.trim() || null,
        socialTiktok: form.socialTiktok.trim() || null,
      }
      return dataClient.online.updateStore(dto)
    },
    onSuccess: () => {
      setToast(t('online.saved'))
      onSaved()
    },
    onError: (e) => setError(errorMessage(e, t('online.saveError'))),
  })
  const publish = useMutation({
    mutationFn: () => dataClient.online.publishStore(),
    onSuccess: () => {
      setToast(t('online.published'))
      onSaved()
    },
    onError: (e) => setError(errorMessage(e, t('online.saveError'))),
  })
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  const published = store.status === 'published'

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('online.cfgTitle')}</h1>
          <p>{t('online.cfgSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {store.hasUnpublishedChanges ? (
            <span
              className="chip-tag"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px' }}
            >
              <span
                style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warning)' }}
              />
              {t('online.unpublished')}
            </span>
          ) : null}
          <Button
            variant="soft"
            type="button"
            onClick={() => save.mutate()}
            loading={save.isPending}
          >
            {t('online.save')}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => publish.mutate()}
            loading={publish.isPending}
          >
            {ICO.rocket}
            {t('online.publish')}
          </Button>
        </div>
      </div>

      <div className="sc-hero" style={{ marginBottom: 16 }}>
        <div>
          <span className="pill">
            <span
              className="dot"
              style={{ background: published ? 'var(--success)' : 'var(--warning)' }}
            />
            {published ? t('online.published2') : t('online.draft')}
          </span>
          <h2>
            {ICO.globe}
            <span>{host}</span>
          </h2>
          <p>
            {published && store.publishedAt
              ? t('online.lastPublished').replace(
                  '{when}',
                  new Date(store.publishedAt).toLocaleDateString(),
                )
              : t('online.notPublished')}
          </p>
        </div>
        <div className="spacer" />
        <div className="meta">
          <div className="b">
            <span className="pb">{t('online.business')}</span> {t('online.storefrontIncluded')}
          </div>
          <div className="s">{t('online.proNote')}</div>
        </div>
      </div>

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="sc-grid">
        <div className="sc-col">
          {/* Store address */}
          <div className="card">
            <div className="card-h">
              <div className="ci">{ICO.globe}</div>
              <div className="ti">
                <h3>{t('online.addressTitle')}</h3>
                <p>{t('online.addressBody')}</p>
              </div>
            </div>
            <label className="lbl">{t('online.subdomain')}</label>
            <div className="dom-field">
              <input
                value={form.storeSlug}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) =>
                  set('storeSlug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
              />
              <span className="suffix">.{STORE_ROOT_DOMAIN}</span>
            </div>
            <div className={`availrow ${slugState.checking ? '' : slugState.ok ? 'ok' : 'bad'}`}>
              {slugState.checking ? null : slugState.ok ? ICO.check : ICO.lock}
              <span>{slugState.msg}</span>
            </div>
            <div className="reserved-note">{t('online.slugNote')}</div>
            <div className="divider" />
            <div className="pro-lock">
              <div className="lk-head">
                <div className="ic">{ICO.lock}</div>
                <div className="t">
                  {t('online.customDomain')}
                  <div className="d">{t('online.customDomainHint')}</div>
                </div>
                <span className="lockchip">{ICO.lock}Pro</span>
              </div>
              <div className="dom-field" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                <input value="www.yourbusiness.cm" disabled />
                <span className="suffix">CNAME</span>
              </div>
            </div>
          </div>

          {/* Theme & appearance */}
          <div className="card">
            <div className="card-h">
              <div className="ci">{ICO.palette}</div>
              <div className="ti">
                <h3>{t('online.themeTitle')}</h3>
                <p>{t('online.themeBody')}</p>
              </div>
            </div>
            <label className="lbl">{t('online.layoutTemplate')}</label>
            <div className="tpl-grid">
              {LAYOUTS.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  className={`tpl${form.layoutTemplate === tpl ? ' sel' : ''}`}
                  onClick={() => set('layoutTemplate', tpl)}
                >
                  <div className="wire">{templateWire(tpl)}</div>
                  <div className="pn">
                    {t(`online.layout.${tpl}`)}
                    <span className="ck">{ICO.check}</span>
                  </div>
                  <div className="ds">{t(`online.layoutDesc.${tpl}`)}</div>
                </button>
              ))}
            </div>
            <div className="divider" />
            <label className="lbl">{t('online.colourTheme')}</label>
            <div className="preset-grid">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  className={`preset${form.themeId === th.id ? ' sel' : ''}`}
                  onClick={() => set('themeId', th.id)}
                >
                  <div className="sw" style={{ background: th.brand }}>
                    <div className="bar" style={{ background: 'rgba(255,255,255,.18)' }} />
                    <div className="dotline">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <div className="pn">
                    {th.name}
                    <span className="ck">{ICO.check}</span>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
              <div style={{ flex: 1 }}>
                <label className="lbl" style={{ marginBottom: 0 }}>
                  {t('online.appearance')}
                </label>
              </div>
              <span className="seg2">
                <button
                  type="button"
                  aria-pressed={form.appearance === 'light'}
                  onClick={() => set('appearance', 'light')}
                >
                  {t('online.light')}
                </button>
                <button
                  type="button"
                  aria-pressed={form.appearance === 'dark'}
                  onClick={() => set('appearance', 'dark')}
                >
                  {t('online.dark')}
                </button>
              </span>
            </div>
            <div className="form-note" style={{ marginTop: 16 }}>
              {ICO.lock}
              <span>{t('online.builderNote')}</span>
            </div>
          </div>

          {/* Catalog & pricing */}
          <div className="card">
            <div className="card-h">
              <div className="ci">{ICO.box}</div>
              <div className="ti">
                <h3>{t('online.catalogTitle')}</h3>
                <p>{t('online.catalogBody')}</p>
              </div>
            </div>
            <div className="bind-grid">
              <button
                type="button"
                className={`bind${form.catalogBinding === 'snapshot' ? ' sel' : ''}`}
                onClick={() => set('catalogBinding', 'snapshot')}
              >
                <span className="rdo" />
                <div className="bn">
                  {t('online.snapshot')} <span className="rec">{t('online.recommended')}</span>
                </div>
                <div className="bd">{t('online.snapshotDesc')}</div>
              </button>
              <button
                type="button"
                className={`bind${form.catalogBinding === 'live' ? ' sel' : ''}`}
                onClick={() => set('catalogBinding', 'live')}
              >
                <span className="rdo" />
                <div className="bn">{t('online.live')}</div>
                <div className="bd">{t('online.liveDesc')}</div>
              </button>
            </div>
            <div className="set-line" style={{ marginTop: 6 }}>
              <div className="t">
                <div className="nm">{t('online.hideOOS')}</div>
                <div className="ds">{t('online.hideOOSDesc')}</div>
              </div>
              <button
                type="button"
                className={`switch${!form.showOutOfStock ? ' on' : ''}`}
                aria-pressed={!form.showOutOfStock}
                onClick={() => set('showOutOfStock', !form.showOutOfStock)}
              />
            </div>
            <div className="set-line">
              <div className="t">
                <div className="nm">{t('online.lowStock')}</div>
                <div className="ds">{t('online.lowStockDesc')}</div>
              </div>
              <button
                type="button"
                className={`switch${form.showLowStockBadges ? ' on' : ''}`}
                aria-pressed={form.showLowStockBadges}
                onClick={() => set('showLowStockBadges', !form.showLowStockBadges)}
              />
            </div>
          </div>

          {/* SEO & sharing */}
          <div className="card">
            <div className="card-h">
              <div className="ci">{ICO.search}</div>
              <div className="ti">
                <h3>{t('online.seoTitle')}</h3>
                <p>{t('online.seoBody')}</p>
              </div>
            </div>
            <div className="seo-lbl">
              <span>{t('online.storeTitle')}</span>
              <span className="cnt">{form.seoTitle.length}/60</span>
            </div>
            <Input value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} />
            <div className="seo-lbl" style={{ marginTop: 14 }}>
              <span>{t('online.metaDesc')}</span>
              <span className="cnt">{form.seoDescription.length}/160</span>
            </div>
            <textarea
              className="input"
              rows={3}
              value={form.seoDescription}
              maxLength={300}
              onChange={(e) => set('seoDescription', e.target.value)}
            />
            <div className="serp">
              <div className="u">{host}</div>
              <div className="t">
                {form.seoTitle || form.storeName || t('online.yourStoreTitle')}
              </div>
              <div className="d">{form.seoDescription || t('online.yourStoreDesc')}</div>
            </div>

            <label className="lbl" style={{ marginTop: 16 }}>
              {t('online.ogImage')}
            </label>
            <FileUpload
              variant="image"
              value={form.ogImageUrl || null}
              onChange={(url) => set('ogImageUrl', url ?? '')}
              folder="online-store"
              label={t('online.ogImageCta')}
              hint={t('online.ogImageHint')}
            />

            <div className="divider" />
            <div className="gen-row">
              <div className="gt">
                <div className="nm">sitemap.xml</div>
                <div className="ds">{t('online.sitemapDesc')}</div>
              </div>
              <span className="st st-ok">
                <span className="d" />
                {t('online.auto')}
              </span>
            </div>
            <div className="gen-row">
              <div className="gt">
                <div className="nm">robots.txt</div>
                <div className="ds">{t('online.robotsDesc')}</div>
              </div>
              <button
                type="button"
                className={`switch${form.robotsIndex ? ' on' : ''}`}
                aria-pressed={form.robotsIndex}
                onClick={() => set('robotsIndex', !form.robotsIndex)}
              />
            </div>

            <div className="divider" />
            <label className="lbl">{t('online.socials')}</label>
            <div className="soc-grid">
              {(
                [
                  ['socialInstagram', SOC.instagram, 'instagram.com/…'],
                  ['socialFacebook', SOC.facebook, 'facebook.com/…'],
                  ['socialX', SOC.x, 'x.com/…'],
                  ['socialLinkedin', SOC.linkedin, 'linkedin.com/company/…'],
                  ['whatsappNumber', SOC.whatsapp, t('online.whatsappNumber')],
                  ['socialTiktok', SOC.tiktok, 'tiktok.com/@…'],
                ] as const
              ).map(([key, icon, ph]) => (
                <div className="soc-field" key={key}>
                  <span className="ic">{icon}</span>
                  <input
                    value={form[key]}
                    placeholder={ph}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* live preview */}
        <div className="sc-side">
          <div className="pv-head">
            <span className="lbl">{t('online.livePreview')}</span>
            <span className="seg2">
              <button
                type="button"
                aria-pressed={device === 'desktop'}
                onClick={() => setDevice('desktop')}
              >
                {t('online.desktop')}
              </button>
              <button
                type="button"
                aria-pressed={device === 'mobile'}
                onClick={() => setDevice('mobile')}
              >
                {t('online.mobile')}
              </button>
            </span>
          </div>
          <div className="pv-frame">
            <div className="pv-bar">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              <span className="pv-url">
                {ICO.lock}
                <span className="sub">{host}</span>
              </span>
              <span className="pv-draft">{published ? t('online.live2') : t('online.draft')}</span>
            </div>
            <div className="pv-stage">
              <div
                className={`spv${device === 'mobile' ? ' mobile' : ''}`}
                data-pvmode={form.appearance}
                style={pvVars(brand, form.appearance)}
              >
                <div className="spv-nav">
                  <div className="spv-logo">{(form.storeName || 'S').charAt(0).toUpperCase()}</div>
                  <div className="spv-name">{form.storeName || t('online.yourStore')}</div>
                </div>
                {previewBody(form.layoutTemplate, form, t)}
              </div>
            </div>
          </div>
          <p className="pv-note">
            {ICO.lock}
            <span>{t('online.previewNote')}</span>
          </p>
        </div>
      </div>

      {toast ? (
        <div className="sc-toast show">
          {ICO.check}
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  )
}

// The storefront preview varies by template (Model A: fixed layout presets). Illustrative
// mock — the real per-template layouts render in the storefront app.
function previewBody(tpl: OnlineStoreLayout, form: Form, t: ReturnType<typeof useT>) {
  const card = (i: number) => (
    <div key={i} className="spv-card">
      <div className="img">
        <span>product</span>
      </div>
      <div className="ct">
        <div className="nm">
          {t('online.sampleProduct')} {i + 1}
        </div>
        <div className="pr">5 000 FCFA</div>
      </div>
    </div>
  )
  const hero = (big?: boolean) => (
    <div className={`spv-hero${big ? ' big' : ''}`}>
      <div className="eb">{form.storeName}</div>
      <h4>{form.seoTitle || t('online.heroSample')}</h4>
      <span className="cta">{t('online.shopNow')}</span>
    </div>
  )
  if (tpl === 'catalog') {
    return (
      <div className="spv-sec">
        <div className="spv-search">{t('online.searchProducts')}</div>
        <div className="spv-list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="spv-row">
              <div className="rimg" />
              <div className="rt">
                <div className="nm">
                  {t('online.sampleProduct')} {i + 1}
                </div>
                <div className="ru" />
              </div>
              <div className="pr">5 000</div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (tpl === 'boutique') {
    return (
      <>
        {hero()}
        <div className="spv-sec">
          <div className="spv-cats">
            {[42, 30, 36, 28].map((w, i) => (
              <span key={i} className="spv-cat" style={{ width: w }} />
            ))}
          </div>
          <div className="sh">{t('online.popular')}</div>
          <div className="spv-grid">{[0, 1].map(card)}</div>
        </div>
      </>
    )
  }
  if (tpl === 'landing') {
    return (
      <>
        {hero(true)}
        <div className="spv-sec">
          <div className="spv-grid">{[0, 1].map(card)}</div>
          <div className="spv-contact">
            <span className="cl" />
            <span className="cb">{t('online.shopNow')}</span>
          </div>
        </div>
      </>
    )
  }
  // classic
  return (
    <>
      {hero()}
      <div className="spv-sec">
        <div className="sh">{t('online.popular')}</div>
        <div className="spv-grid">{[0, 1, 2, 3].map(card)}</div>
      </div>
    </>
  )
}

function pvVars(brand: string, mode: OnlineStoreAppearance): CSSProperties {
  const m =
    mode === 'dark'
      ? {
          bg: '#0E1420',
          surf: '#161D2B',
          inset: '#1B2433',
          text: '#E7EBF1',
          mut: '#7A8494',
          border: '#28303F',
        }
      : {
          bg: '#F4F5F7',
          surf: '#FFFFFF',
          inset: '#EEF0F3',
          text: '#1A2230',
          mut: '#8A93A1',
          border: '#E4E7EC',
        }
  return {
    ['--pv-brand' as string]: brand,
    ['--pv-bg' as string]: m.bg,
    ['--pv-surf' as string]: m.surf,
    ['--pv-inset' as string]: m.inset,
    ['--pv-text' as string]: m.text,
    ['--pv-mut' as string]: m.mut,
    ['--pv-border' as string]: m.border,
    ['--pv-stripe' as string]: mode === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)',
  }
}
