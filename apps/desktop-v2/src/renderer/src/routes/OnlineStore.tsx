import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Modal, PhoneInput, Select } from '@biztrack/ui/biztrack'
import { PaymentMethod } from '@biztrack/types'
import type { DeliveryZone, UnlistedAreaBehavior } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { useSessionStore } from '@/stores/session.store'
import { STORE_ROOT_DOMAIN } from '@/lib/config'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
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
  'preview',
]
// Colour themes double as the storefront brand palette (themeId → primaryColor). Kept to the four
// the storefront can render.
const THEMES: Array<{ id: string; name: string; brand: string }> = [
  { id: 'a', name: 'Ink Blue', brand: '#16467A' },
  { id: 'b', name: 'Slate Teal', brand: '#0F5C5C' },
  { id: 'c', name: 'Graphite', brand: '#33332F' },
  { id: 'd', name: 'Indigo', brand: '#4A3F94' },
]
const LAYOUTS: OnlineStoreLayout[] = ['classic', 'boutique', 'catalog', 'landing']

const ICO = {
  store: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 9h16l-1.2 10.2a1 1 0 0 1-1 .8H6.2a1 1 0 0 1-1-.8Z" />
      <path d="M4 9 6 4h12l2 5M9 13h6" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9Z" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 16V8l-9-5-9 5v8l9 5 9-5Z" />
      <path d="M3.3 7 12 12l8.7-5M12 12v10" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
    </svg>
  ),
  warn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  external: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4M12 8v4l3 2" />
    </svg>
  ),
  rocket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
}

type Form = {
  storeName: string
  storeSlug: string
  tagline: string
  logoUrl: string
  bannerUrl: string
  phone: string
  email: string
  address: string
  city: string
  isActive: boolean
  allowOrderNotes: boolean
  minOrderAmount: string
  paymentCashOnDelivery: boolean
  paymentMtnMomo: boolean
  paymentOrangeMoney: boolean
  paymentCard: boolean
  allowPartialPayment: boolean
  partialMinPercent: string
  partialMinOrderAmount: string
  depositRequired: boolean
  codMinOrderAmount: string
  codMaxOrderAmount: string
  offerDelivery: boolean
  offerPickup: boolean
  deliveryFee: string
  pickupAddress: string
  deliveryCities: string[]
  deliveryZones: DeliveryZone[]
  freeDeliveryOverAmount: string
  unlistedAreaBehavior: UnlistedAreaBehavior
  unlistedDefaultFee: string
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
    tagline: s.tagline ?? '',
    logoUrl: s.logoUrl ?? '',
    bannerUrl: s.bannerUrl ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    address: s.address ?? '',
    city: s.city ?? '',
    isActive: s.isActive,
    allowOrderNotes: s.allowOrderNotes,
    minOrderAmount: s.minOrderAmount != null ? String(s.minOrderAmount) : '',
    paymentCashOnDelivery: s.paymentCashOnDelivery,
    paymentMtnMomo: s.paymentMtnMomo,
    paymentOrangeMoney: s.paymentOrangeMoney,
    paymentCard: s.paymentCard,
    allowPartialPayment: s.allowPartialPayment ?? false,
    partialMinPercent: s.partialMinPercent != null ? String(s.partialMinPercent) : '50',
    partialMinOrderAmount: s.partialMinOrderAmount ? String(s.partialMinOrderAmount) : '',
    depositRequired: s.depositRequired ?? false,
    codMinOrderAmount: s.codMinOrderAmount ? String(s.codMinOrderAmount) : '',
    codMaxOrderAmount: s.codMaxOrderAmount != null ? String(s.codMaxOrderAmount) : '',
    offerDelivery: s.offerDelivery,
    offerPickup: s.offerPickup,
    deliveryFee: s.deliveryFee != null ? String(s.deliveryFee) : '',
    pickupAddress: s.pickupAddress ?? '',
    deliveryCities: s.deliveryCities ?? [],
    deliveryZones: s.deliveryZones ?? [],
    freeDeliveryOverAmount:
      s.freeDeliveryOverAmount != null ? String(s.freeDeliveryOverAmount) : '',
    unlistedAreaBehavior: s.unlistedAreaBehavior ?? 'BLOCK',
    unlistedDefaultFee: s.unlistedDefaultFee ? String(s.unlistedDefaultFee) : '',
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

type T = ReturnType<typeof useT>

// ---- small building blocks (match design-store-config-v2: fld / sline / dep) ----
function Fld({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="fld">
      <label className="lbl">{label}</label>
      {children}
      {desc ? <div className="desc">{desc}</div> : null}
    </div>
  )
}
function Switch({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`switch${on ? ' on' : ''}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
    />
  )
}
function SLine({
  title,
  desc,
  on,
  onToggle,
  disabled,
}: {
  title: string
  desc: string
  on: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <div className="sline" style={disabled ? { opacity: 0.6 } : undefined}>
      <div className="sl-txt">
        <div className="sl-t">{title}</div>
        <div className="sl-d">{desc}</div>
      </div>
      <Switch on={on} onToggle={onToggle} disabled={disabled} />
    </div>
  )
}
/** Header autosave indicator. One pill, priority-ordered: saving → unsaved → failed → just-saved →
 *  unpublished (draft ahead of the published snapshot) → all saved. */
function SaveStatus({
  t,
  saving,
  dirty,
  error,
  justSaved,
  unpublished,
}: {
  t: T
  saving: boolean
  dirty: boolean
  error: boolean
  justSaved: boolean
  unpublished: boolean
}) {
  let cls = ''
  let label: string
  if (saving) label = t('online.saving')
  else if (dirty) label = t('online.unsavedChanges')
  else if (error) {
    cls = ' err'
    label = t('online.saveFailedShort')
  } else if (justSaved) {
    cls = ' clean'
    label = t('online.saved')
  } else if (unpublished) label = t('online.unpublished')
  else {
    cls = ' clean'
    label = t('online.saved')
  }
  return (
    <span className={`sh-dirty${cls}`}>
      <span className="dot" />
      {label}
    </span>
  )
}

function CardHead({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="card-h">
      <div className="ci">{icon}</div>
      <div className="ti">
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
    </div>
  )
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
function CreateStore({ t, onCreated }: { t: T; onCreated: () => void }) {
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

// --- store configuration (sectioned, design-store-config-v2) ---------------
type SectionId = 'domains' | 'storefront' | 'theme' | 'catalog' | 'payments' | 'delivery' | 'seo'

function StoreConfig({ store, t, onSaved }: { store: Store; t: T; onSaved: () => void }) {
  const money = useCurrency()
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(() => toForm(store))
  const [section, setSection] = useState<SectionId>('domains')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Autosave: `dirty` = in-memory edits not yet persisted to the draft; `justSaved` = a
  // brief confirmation window after a successful autosave.
  const [dirty, setDirty] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  useEffect(() => {
    // Reloaded draft from the server (initial load / after a save or restore) — resync the
    // form without marking it dirty so it doesn't trigger another autosave.
    setForm(toForm(store))
    setDirty(false)
  }, [store])
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
    setJustSaved(false)
    setError(null)
  }
  const cur = (key: Parameters<T>[0]) => t(key).replace('{currency}', money.currency)

  // Provider-backed methods the business can actually collect (owner-only; on error treat as none).
  const availableQ = useQuery({
    queryKey: ['payments', 'available'],
    queryFn: () => dataClient.payments.availableMethods(),
    retry: false,
  })
  const availableMethods = useMemo(
    () => new Set((availableQ.data ?? []).map((m) => m.method)),
    [availableQ.data],
  )

  // Countries (loaded once) power every zone-row country picker.
  const countriesQ = useQuery({
    queryKey: ['geo', 'countries'],
    queryFn: () => dataClient.online.getCountries(),
    retry: false,
    staleTime: 60 * 60 * 1000,
  })
  const countries = countriesQ.data ?? []

  const brand = THEMES.find((x) => x.id === form.themeId)?.brand ?? '#16467A'
  const host = `${form.storeSlug || 'yourshop'}.${STORE_ROOT_DOMAIN}`

  // Slug availability (debounced server check, skipped for the store's current slug).
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
    if (RESERVED.includes(v)) return { ok: false, msg: t('online.slugReserved').replace('{slug}', v) }
    if (isOwnSlug) return { ok: true, msg: t('online.slugAvailable') }
    if (v !== debouncedSlug.trim().toLowerCase() || slugCheck.isFetching)
      return { ok: true, checking: true, msg: t('online.slugChecking') }
    const r = slugCheck.data
    if (!r) return { ok: true, checking: true, msg: t('online.slugChecking') }
    if (r.available) return { ok: true, msg: t('online.slugAvailable') }
    if (r.reason === 'taken') return { ok: false, msg: t('online.slugTaken') }
    if (r.reason === 'reserved') return { ok: false, msg: t('online.slugReserved').replace('{slug}', v) }
    return { ok: false, msg: t('online.slugInvalid') }
  }, [form.storeSlug, debouncedSlug, isOwnSlug, slugCheck.isFetching, slugCheck.data, t])

  const save = useMutation({
    mutationFn: () => {
      // A deposit floor below the configured minimum is rejected, not silently reinstated.
      const dto: UpdateOnlineStoreRequest = {
        storeName: form.storeName.trim(),
        storeSlug: form.storeSlug.trim(),
        tagline: form.tagline.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
        bannerUrl: form.bannerUrl.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        isActive: form.isActive,
        allowOrderNotes: form.allowOrderNotes,
        minOrderAmount: form.minOrderAmount.trim()
          ? Math.max(0, Math.round(Number(form.minOrderAmount)))
          : null,
        paymentCashOnDelivery: form.paymentCashOnDelivery,
        paymentMtnMomo: form.paymentMtnMomo && availableMethods.has(PaymentMethod.MTN_MOMO),
        paymentOrangeMoney:
          form.paymentOrangeMoney && availableMethods.has(PaymentMethod.ORANGE_MONEY),
        paymentCard: form.paymentCard && availableMethods.has(PaymentMethod.CARD),
        allowPartialPayment: form.allowPartialPayment,
        partialMinPercent: Math.min(100, Math.max(1, Math.round(Number(form.partialMinPercent) || 50))),
        partialMinOrderAmount: form.partialMinOrderAmount.trim()
          ? Math.max(0, Math.round(Number(form.partialMinOrderAmount)))
          : 0,
        depositRequired: form.depositRequired,
        codMinOrderAmount: form.codMinOrderAmount.trim()
          ? Math.max(0, Math.round(Number(form.codMinOrderAmount)))
          : 0,
        codMaxOrderAmount: form.codMaxOrderAmount.trim()
          ? Math.max(0, Math.round(Number(form.codMaxOrderAmount)))
          : null,
        offerDelivery: form.offerDelivery,
        offerPickup: form.offerPickup,
        deliveryFee: form.deliveryFee.trim() ? Math.max(0, Math.round(Number(form.deliveryFee))) : 0,
        pickupAddress: form.pickupAddress.trim() || null,
        deliveryCities: form.deliveryCities,
        deliveryZones: form.deliveryZones.map((z) => ({
          ...z,
          name: z.name.trim(),
          fee: Math.max(0, Math.round(Number(z.fee) || 0)),
        })),
        freeDeliveryOverAmount: form.freeDeliveryOverAmount.trim()
          ? Math.max(0, Math.round(Number(form.freeDeliveryOverAmount)))
          : null,
        unlistedAreaBehavior: form.unlistedAreaBehavior,
        unlistedDefaultFee: form.unlistedDefaultFee.trim()
          ? Math.max(0, Math.round(Number(form.unlistedDefaultFee)))
          : 0,
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
      // Autosave is silent (the header status pill is the feedback) — no toast on every save.
      setError(null)
      setDirty(false)
      setJustSaved(true)
      onSaved()
    },
    // Stop auto-retrying a failing save (avoids hammering a down server); the next edit re-arms it.
    onError: (e) => {
      setDirty(false)
      setError(errorMessage(e, t('online.saveError')))
    },
  })
  const publish = useMutation({
    mutationFn: () => dataClient.online.publishStore(),
    onSuccess: () => {
      setToast(t('online.published'))
      void qc.invalidateQueries({ queryKey: ['online', 'publications'] })
      onSaved()
    },
    onError: (e) => setError(errorMessage(e, t('online.saveError'))),
  })
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  // Debounced autosave: ~1s after the last edit, persist the draft. Held while the subdomain is
  // invalid or the store name is empty (a save would 400) — the pill stays "Unsaved" until valid.
  const canAutosave = slugState.ok && !!form.storeName.trim()
  useEffect(() => {
    if (!dirty || save.isPending || !canAutosave) return
    const id = setTimeout(() => save.mutate(), 1000)
    return () => clearTimeout(id)
    // `form` in deps re-arms the debounce on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, canAutosave, save.isPending, form])

  useEffect(() => {
    if (!justSaved) return
    const id = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(id)
  }, [justSaved])

  const seoIncomplete = !form.seoTitle.trim() && !form.seoDescription.trim()
  const sections: Array<{ id: SectionId; icon: ReactNode; label: string; count?: string; warn?: boolean }> =
    [
      { id: 'domains', icon: ICO.globe, label: t('online.navDomains') },
      { id: 'storefront', icon: ICO.store, label: t('online.navStorefront') },
      { id: 'theme', icon: ICO.globe, label: t('online.navTheme') },
      { id: 'catalog', icon: ICO.box, label: t('online.navCatalog') },
      { id: 'payments', icon: ICO.card, label: t('online.navPayments') },
      {
        id: 'delivery',
        icon: ICO.truck,
        label: t('online.navDelivery'),
        count: form.deliveryZones.length
          ? t('online.zonesCountLabel').replace('{n}', String(form.deliveryZones.length))
          : undefined,
      },
      { id: 'seo', icon: ICO.globe, label: t('online.navSeo'), warn: seoIncomplete },
    ]

  return (
    <div className="frame sc2">
      {/* static store header */}
      <div className="sc-head">
        <div className="sh-id">
          <div className="sh-mk">{(form.storeName || 'S').charAt(0).toUpperCase()}</div>
          <div className="sh-t">
            <h1>
              {form.storeName || t('online.yourStore')}
              <span className={`sh-state${form.isActive ? '' : ' off'}`}>
                <span className="d" />
                {form.isActive ? t('online.active') : t('online.inactive')}
              </span>
            </h1>
            <a className="sh-url" href={`https://${host}`} target="_blank" rel="noopener noreferrer">
              {host}
              {ICO.external}
            </a>
          </div>
        </div>
        <div className="sh-acts">
          <Switch
            on={form.isActive}
            onToggle={() => set('isActive', !form.isActive)}
          />
          <span className="sh-sep" />
          <Button variant="soft" type="button" onClick={() => setHistoryOpen(true)}>
            {ICO.history}
            {t('online.versionHistory')}
          </Button>
          <Button
            variant="soft"
            type="button"
            onClick={() => window.open(`https://preview.${host}`, '_blank', 'noopener,noreferrer')}
          >
            {ICO.eye}
            {t('online.openPreview')}
          </Button>
          <Button
            variant="soft"
            type="button"
            onClick={() => window.open(`https://${host}`, '_blank', 'noopener,noreferrer')}
          >
            {ICO.external}
            {t('online.viewLive')}
          </Button>
          <span className="sh-sep" />
          <SaveStatus
            t={t}
            saving={save.isPending}
            dirty={dirty}
            error={!!error}
            justSaved={justSaved}
            unpublished={store.hasUnpublishedChanges}
          />
          <Button
            variant="primary"
            type="button"
            onClick={() => publish.mutate()}
            loading={publish.isPending}
            disabled={dirty || save.isPending}
          >
            {ICO.rocket}
            {t('online.publish')}
          </Button>
        </div>
      </div>

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      {/* mobile section picker */}
      <div className="sc-navsel">
        <Select
          value={section}
          onChange={(e) => setSection(e.target.value as SectionId)}
          options={sections.map((s) => ({
            value: s.id,
            label: s.count ? `${s.label} · ${s.count}` : s.label,
          }))}
        />
      </div>

      <div className="sc-shell">
        <nav className="sc-nav">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ni${section === s.id ? ' on' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {s.icon}
              <span className="lab">{s.label}</span>
              {s.count ? <span className="ct">{s.count}</span> : null}
              {s.warn ? <span className="warn" title={t('online.navSeo')} /> : null}
            </button>
          ))}
        </nav>

        <div className="sc-panes">
          <section className="pane on">
            {section === 'domains' ? <DomainsPane {...{ t, form, set, slugState }} /> : null}
            {section === 'storefront' ? <StorefrontPane {...{ t, form, set }} /> : null}
            {section === 'theme' ? <ThemePane {...{ t, form, set }} /> : null}
            {section === 'catalog' ? <CatalogPane {...{ t, form, set, cur }} /> : null}
            {section === 'payments' ? (
              <PaymentsPane {...{ t, form, set, cur, availableMethods }} />
            ) : null}
            {section === 'delivery' ? (
              <DeliveryPane {...{ t, form, set, cur, countries }} />
            ) : null}
            {section === 'seo' ? <SeoPane {...{ t, form, set, host }} /> : null}
          </section>
        </div>
      </div>

      {historyOpen ? (
        <Modal open onClose={() => setHistoryOpen(false)} title={t('online.versionHistory')}>
          <PublishHistory t={t} onRestored={() => setHistoryOpen(false)} />
        </Modal>
      ) : null}

      {toast ? (
        <div className="sc-toast show">
          {ICO.check}
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ panes ---
type PaneProps = {
  t: T
  form: Form
  set: <K extends keyof Form>(k: K, v: Form[K]) => void
}

function DomainsPane({
  t,
  form,
  set,
  slugState,
}: PaneProps & { slugState: { ok: boolean; msg: string; checking?: boolean } }) {
  return (
    <>
      <div className="card">
        <CardHead icon={ICO.globe} title={t('online.addressTitle')} sub={t('online.addressBody')} />
        <Fld label={t('online.subdomain')} desc={t('online.slugNote')}>
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
            {slugState.checking ? null : slugState.ok ? ICO.check : ICO.warn}
            <span>{slugState.msg}</span>
          </div>
        </Fld>
      </div>

      <div className="card">
        <CardHead
          icon={ICO.globe}
          title={t('online.customDomainsTitle')}
          sub={t('online.customDomainsBody')}
        />
        <Fld label={t('online.addDomain')} desc={t('online.addDomainHint')}>
          <div style={{ display: 'flex', gap: 9, opacity: 0.55, pointerEvents: 'none' }}>
            <Input placeholder="shop.mon-domaine.cm" style={{ flex: 1 }} disabled />
            <Button variant="primary" type="button" disabled>
              {t('online.connect')}
            </Button>
          </div>
        </Fld>
        <div className="gate">
          {ICO.warn}
          <span>{t('online.customDomainGate')}</span>
        </div>
      </div>
    </>
  )
}

function StorefrontPane({ t, form, set }: PaneProps) {
  return (
    <div className="card">
      <CardHead icon={ICO.store} title={t('online.profileTitle')} sub={t('online.profileBody')} />
      <div className="fld-row">
        <Fld label={t('online.storeName')} desc={t('online.storeNameHint')}>
          <Input value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
        </Fld>
        <Fld label={t('online.tagline')}>
          <Input
            value={form.tagline}
            placeholder={t('online.taglinePh')}
            onChange={(e) => set('tagline', e.target.value)}
          />
        </Fld>
      </div>
      <div className="fld-row">
        <Fld label={t('online.logo')}>
          <FileUpload
            variant="image"
            value={form.logoUrl || null}
            onChange={(url) => set('logoUrl', url ?? '')}
            folder="online-store"
            label={t('online.logoCta')}
          />
        </Fld>
        <Fld label={t('online.banner')}>
          <FileUpload
            variant="image"
            value={form.bannerUrl || null}
            onChange={(url) => set('bannerUrl', url ?? '')}
            folder="online-store"
            label={t('online.bannerCta')}
          />
        </Fld>
      </div>
      <div className="fld-row">
        <Fld label={t('online.phone')}>
          <PhoneInput
            value={form.phone || undefined}
            defaultCountry="CM"
            placeholder="6 78 22 14 02"
            onChange={(v) => set('phone', v ?? '')}
          />
        </Fld>
        <Fld label={t('online.whatsapp')} desc={t('online.whatsappHint')}>
          <PhoneInput
            value={form.whatsappNumber || undefined}
            defaultCountry="CM"
            placeholder="6 78 22 14 02"
            onChange={(v) => set('whatsappNumber', v ?? '')}
          />
        </Fld>
      </div>
      <div className="fld-row">
        <Fld label={t('online.email')}>
          <Input
            type="email"
            value={form.email}
            placeholder="store@business.cm"
            onChange={(e) => set('email', e.target.value)}
          />
        </Fld>
        <Fld label={t('online.city')}>
          <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Fld>
      </div>
      <Fld label={t('online.address')}>
        <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
      </Fld>
    </div>
  )
}

function ThemePane({ t, form, set }: PaneProps) {
  return (
    <>
      <div className="card">
        <CardHead icon={ICO.globe} title={t('online.themeTitle')} sub={t('online.themeBody')} />
        <Fld label={t('online.layoutTemplate')} desc={t('online.builderNote')}>
          <div className="preset-grid">
            {LAYOUTS.map((tpl) => (
              <button
                key={tpl}
                type="button"
                className={`preset${form.layoutTemplate === tpl ? ' sel' : ''}`}
                onClick={() => set('layoutTemplate', tpl)}
              >
                <div className="sw" style={{ background: 'var(--brand)' }}>
                  <span className="bar" style={{ background: 'rgba(255,255,255,.25)' }} />
                  <span className="dotline">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <div className="pn">
                  {t(`online.layout.${tpl}` as Parameters<T>[0])}
                  <span className="ck">{ICO.check}</span>
                </div>
                <div className="pd">{t(`online.layoutDesc.${tpl}` as Parameters<T>[0])}</div>
              </button>
            ))}
          </div>
        </Fld>
      </div>

      <div className="card">
        <CardHead
          icon={ICO.globe}
          title={t('online.appearanceTitle')}
          sub={t('online.appearanceBody')}
        />
        <Fld label={t('online.colourTheme')}>
          <div className="colorrow">
            {THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                aria-label={th.name}
                title={th.name}
                className={`cbtn${form.themeId === th.id ? ' sel' : ''}`}
                style={{ background: th.brand }}
                onClick={() => set('themeId', th.id)}
              />
            ))}
          </div>
        </Fld>
        <Fld label={t('online.appearance')}>
          <Select
            value={form.appearance}
            onChange={(e) => set('appearance', e.target.value as OnlineStoreAppearance)}
            options={[
              { value: 'light', label: t('online.light') },
              { value: 'dark', label: t('online.dark') },
            ]}
          />
        </Fld>
      </div>
    </>
  )
}

function CatalogPane({ t, form, set, cur }: PaneProps & { cur: (k: Parameters<T>[0]) => string }) {
  return (
    <div className="card">
      <CardHead icon={ICO.box} title={t('online.catalogTitle')} sub={t('online.catalogBody')} />
      <SLine
        title={t('online.hideOOS')}
        desc={t('online.hideOOSDesc')}
        on={!form.showOutOfStock}
        onToggle={() => set('showOutOfStock', !form.showOutOfStock)}
      />
      <SLine
        title={t('online.lowStock')}
        desc={t('online.lowStockDesc')}
        on={form.showLowStockBadges}
        onToggle={() => set('showLowStockBadges', !form.showLowStockBadges)}
      />
      <div className="divider" />
      <Fld label={t('online.catalogBinding')} desc={t('online.snapshotDesc')}>
        <Select
          value={form.catalogBinding}
          onChange={(e) => set('catalogBinding', e.target.value as 'snapshot' | 'live')}
          options={[
            { value: 'live', label: t('online.live') },
            { value: 'snapshot', label: t('online.snapshot') },
          ]}
        />
      </Fld>
      <Fld label={cur('online.minOrder')} desc={t('online.minOrderHint')}>
        <Input
          inputMode="numeric"
          value={form.minOrderAmount}
          placeholder="0"
          onChange={(e) => set('minOrderAmount', e.target.value.replace(/[^0-9]/g, ''))}
        />
      </Fld>
    </div>
  )
}

function PaymentsPane({
  t,
  form,
  set,
  cur,
  availableMethods,
}: PaneProps & { cur: (k: Parameters<T>[0]) => string; availableMethods: Set<PaymentMethod> }) {
  const method = (
    label: Parameters<T>[0],
    desc: Parameters<T>[0],
    on: boolean,
    available: boolean,
    onToggle: () => void,
  ) => (
    <SLine
      title={t(label)}
      desc={available ? t(desc) : t('online.payNeedsSetup')}
      on={on}
      disabled={!available}
      onToggle={onToggle}
    />
  )
  return (
    <>
      <div className="card">
        <CardHead
          icon={ICO.card}
          title={t('online.payMethodsTitle')}
          sub={t('online.payMethodsBody')}
        />
        {method(
          'online.cod',
          'online.codDesc',
          form.paymentCashOnDelivery,
          true,
          () => set('paymentCashOnDelivery', !form.paymentCashOnDelivery),
        )}
        {method(
          'online.payMtnMomo',
          'online.payMtnMomoDesc',
          form.paymentMtnMomo && availableMethods.has(PaymentMethod.MTN_MOMO),
          availableMethods.has(PaymentMethod.MTN_MOMO),
          () => set('paymentMtnMomo', !form.paymentMtnMomo),
        )}
        {method(
          'online.payOrangeMoney',
          'online.payOrangeMoneyDesc',
          form.paymentOrangeMoney && availableMethods.has(PaymentMethod.ORANGE_MONEY),
          availableMethods.has(PaymentMethod.ORANGE_MONEY),
          () => set('paymentOrangeMoney', !form.paymentOrangeMoney),
        )}
        {method(
          'online.payCard',
          'online.payCardDesc',
          form.paymentCard && availableMethods.has(PaymentMethod.CARD),
          availableMethods.has(PaymentMethod.CARD),
          () => set('paymentCard', !form.paymentCard),
        )}
        <div className="gate">
          {ICO.warn}
          <span>{t('online.payGateHint')}</span>
        </div>
      </div>

      <div className="card">
        <CardHead icon={ICO.card} title={t('online.prepayTitle')} sub={t('online.prepayBody')} />
        <SLine
          title={t('online.allowPartial')}
          desc={t('online.allowPartialDesc')}
          on={form.allowPartialPayment}
          onToggle={() => set('allowPartialPayment', !form.allowPartialPayment)}
        />
        {form.allowPartialPayment ? (
          <div className="dep">
            <div className="dh">{t('online.depositRules')}</div>
            <div className="fld-row">
              <Fld label={t('online.partialMinPercent')} desc={t('online.partialMinPercentHint')}>
                <Input
                  inputMode="numeric"
                  value={form.partialMinPercent}
                  placeholder="50"
                  onChange={(e) => set('partialMinPercent', e.target.value.replace(/[^0-9]/g, ''))}
                />
              </Fld>
              <Fld label={cur('online.partialMinOrder')} desc={t('online.partialMinOrderHint')}>
                <Input
                  inputMode="numeric"
                  value={form.partialMinOrderAmount}
                  placeholder="0"
                  onChange={(e) =>
                    set('partialMinOrderAmount', e.target.value.replace(/[^0-9]/g, ''))
                  }
                />
              </Fld>
            </div>
            <SLine
              title={t('online.depositRequired')}
              desc={t('online.depositRequiredDesc')}
              on={form.depositRequired}
              onToggle={() => set('depositRequired', !form.depositRequired)}
            />
          </div>
        ) : null}
      </div>

      <div className="card">
        <CardHead icon={ICO.card} title={t('online.codRules')} sub={t('online.codLimitsBody')} />
        <div className="fld-row">
          <Fld label={cur('online.codMin')} desc={t('online.codMinHint')}>
            <Input
              inputMode="numeric"
              value={form.codMinOrderAmount}
              placeholder="0"
              onChange={(e) => set('codMinOrderAmount', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Fld>
          <Fld label={cur('online.codMax')} desc={t('online.codMaxHint')}>
            <Input
              inputMode="numeric"
              value={form.codMaxOrderAmount}
              placeholder={t('online.codMaxPlaceholder')}
              onChange={(e) => set('codMaxOrderAmount', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Fld>
        </div>
      </div>
    </>
  )
}

function DeliveryPane({
  t,
  form,
  set,
  cur,
  countries,
}: PaneProps & {
  cur: (k: Parameters<T>[0]) => string
  countries: Array<{ iso2: string; name: string }>
}) {
  const UNLISTED: Array<{ id: UnlistedAreaBehavior; title: Parameters<T>[0]; desc: Parameters<T>[0] }> =
    [
      { id: 'BLOCK', title: 'online.unlBlock', desc: 'online.unlBlockDesc' },
      { id: 'DEFAULT_FEE', title: 'online.unlFee', desc: 'online.unlFeeDesc' },
      { id: 'ARRANGE', title: 'online.unlArrange', desc: 'online.unlArrangeDesc' },
    ]
  return (
    <>
      <div className="card">
        <CardHead icon={ICO.truck} title={t('online.deliveryTitle')} sub={t('online.deliveryBody')} />
        <SLine
          title={t('online.offerDelivery')}
          desc={t('online.offerDeliveryDesc')}
          on={form.offerDelivery}
          onToggle={() => set('offerDelivery', !form.offerDelivery)}
        />
        {form.offerDelivery ? (
          <div className="dep bare">
            <ZoneEditor t={t} form={form} set={set} countries={countries} />

            <div className="divider" />
            <SLine
              title={t('online.freeDelivery')}
              desc={t('online.freeDeliveryDesc')}
              on={!!form.freeDeliveryOverAmount.trim()}
              onToggle={() =>
                set('freeDeliveryOverAmount', form.freeDeliveryOverAmount.trim() ? '' : '25000')
              }
            />
            {form.freeDeliveryOverAmount.trim() ? (
              <div className="dep">
                <Fld label={cur('online.freeDeliveryFrom')} desc={t('online.freeDeliveryFromHint')}>
                  <Input
                    inputMode="numeric"
                    value={form.freeDeliveryOverAmount}
                    placeholder="25000"
                    onChange={(e) =>
                      set('freeDeliveryOverAmount', e.target.value.replace(/[^0-9]/g, ''))
                    }
                  />
                </Fld>
              </div>
            ) : null}

            <div className="divider" />
            <Fld label={t('online.unlistedTitle')}>
              <div className="choice">
                {UNLISTED.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ch${form.unlistedAreaBehavior === c.id ? ' sel' : ''}`}
                    onClick={() => set('unlistedAreaBehavior', c.id)}
                  >
                    <span className="rdo" />
                    <span>
                      <span className="ct">{t(c.title)}</span>
                      <span className="cd">{t(c.desc)}</span>
                    </span>
                  </button>
                ))}
              </div>
              {form.unlistedAreaBehavior === 'DEFAULT_FEE' ? (
                <div className="dep" style={{ marginTop: 12 }}>
                  <Fld label={cur('online.unlDefaultFee')} desc={t('online.unlDefaultFeeHint')}>
                    <Input
                      inputMode="numeric"
                      value={form.unlistedDefaultFee}
                      placeholder="0"
                      onChange={(e) =>
                        set('unlistedDefaultFee', e.target.value.replace(/[^0-9]/g, ''))
                      }
                    />
                  </Fld>
                </div>
              ) : null}
            </Fld>
          </div>
        ) : null}
      </div>

      <div className="card">
        <CardHead icon={ICO.store} title={t('online.pickupTitle')} sub={t('online.pickupBody')} />
        <SLine
          title={t('online.offerPickup')}
          desc={t('online.offerPickupDesc')}
          on={form.offerPickup}
          onToggle={() => set('offerPickup', !form.offerPickup)}
        />
        {form.offerPickup ? (
          <div className="dep">
            <Fld label={t('online.pickupAddress')}>
              <textarea
                className="input"
                rows={2}
                style={{ height: 'auto', padding: '10px 12px' }}
                value={form.pickupAddress}
                placeholder={t('online.pickupAddressPh')}
                onChange={(e) => set('pickupAddress', e.target.value)}
              />
            </Fld>
          </div>
        ) : null}
      </div>
    </>
  )
}

// ---- delivery-zone editor (the heart of Slice ③) ----
function ZoneEditor({
  t,
  form,
  set,
  countries,
}: PaneProps & { countries: Array<{ iso2: string; name: string }> }) {
  const zones = form.deliveryZones
  const update = (i: number, patch: Partial<DeliveryZone>) =>
    set(
      'deliveryZones',
      zones.map((z, idx) => (idx === i ? { ...z, ...patch } : z)),
    )
  const remove = (i: number) => set('deliveryZones', zones.filter((_, idx) => idx !== i))
  const add = () =>
    set('deliveryZones', [
      ...zones,
      {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `z_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        fee: 0,
        countryIso2: 'CM',
        region: null,
        city: null,
      },
    ])

  return (
    <Fld label={t('online.zonesLabel')} desc={t('online.zonesHint')}>
      <div className="zwrap">
        <div className="zhead">
          <span>{t('online.zoneName')}</span>
          <span>{t('online.zoneCountry')}</span>
          <span>{t('online.zoneRegion')}</span>
          <span>{t('online.zoneCity')}</span>
          <span>{t('online.zoneScope')}</span>
          <span>{t('online.zoneFee').replace('{currency}', '')}</span>
          <span />
        </div>
        {zones.length === 0 ? (
          <div className="zempty">{t('online.zonesEmpty')}</div>
        ) : (
          <div className="zlist">
            {zones.map((z, i) => (
              <ZoneRow
                key={z.id}
                t={t}
                zone={z}
                countries={countries}
                onChange={(patch) => update(i, patch)}
                onRemove={() => remove(i)}
              />
            ))}
          </div>
        )}
        <button type="button" className="zadd" onClick={add}>
          {ICO.plus}
          {t('online.addZone')}
        </button>
      </div>
    </Fld>
  )
}

function ZoneRow({
  t,
  zone,
  countries,
  onChange,
  onRemove,
}: {
  t: T
  zone: DeliveryZone
  countries: Array<{ iso2: string; name: string }>
  onChange: (patch: Partial<DeliveryZone>) => void
  onRemove: () => void
}) {
  const countryLabel = countries.find((c) => c.iso2 === zone.countryIso2)?.name ?? zone.countryIso2
  const scope: 'city' | 'region' | 'country' = zone.city ? 'city' : zone.region ? 'region' : 'country'
  const scopeClass = scope === 'city' ? '' : scope === 'region' ? ' reg' : ' ctry'
  const scopeLabel =
    scope === 'city'
      ? t('online.scopeCity')
      : scope === 'region'
        ? t('online.scopeRegion')
        : t('online.scopeCountry')

  const loadCountries = async (search: string) => {
    const s = search.trim().toLowerCase()
    return countries
      .filter((c) => !s || c.name.toLowerCase().includes(s))
      .map((c) => ({ value: c.iso2, label: c.name }))
  }
  const loadRegions = async (search: string) => {
    if (!zone.countryIso2) return []
    const rows = await dataClient.online.getRegions(zone.countryIso2)
    const s = search.trim().toLowerCase()
    return rows
      .filter((r) => !s || r.name.toLowerCase().includes(s))
      .map((r) => ({ value: r.name, label: r.name }))
  }
  const loadCities = async (search: string) => {
    if (!zone.countryIso2 || !zone.region) return []
    const rows = await dataClient.online.getCities(zone.countryIso2, zone.region)
    const s = search.trim().toLowerCase()
    return rows
      .filter((c) => !s || c.name.toLowerCase().includes(s))
      .map((c) => ({ value: c.name, label: c.name }))
  }

  return (
    <div className="zrow">
      <Input
        value={zone.name}
        placeholder={t('online.zoneName')}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <CommandSelect
        value={zone.countryIso2 ?? null}
        valueLabel={zone.countryIso2 ? countryLabel : null}
        onChange={(v) => onChange({ countryIso2: v, region: null, city: null })}
        loadOptions={loadCountries}
        placeholder={t('online.selectCountry')}
        searchPlaceholder={t('online.zoneCountry')}
      />
      <CommandSelect
        value={zone.region ?? null}
        valueLabel={zone.region ?? null}
        onChange={(v) => onChange({ region: v, city: null })}
        loadOptions={loadRegions}
        placeholder={t('online.allRegions')}
        searchPlaceholder={t('online.searchRegion')}
        clearLabel={t('online.allRegions')}
        disabled={!zone.countryIso2}
      />
      <CommandSelect
        value={zone.city ?? null}
        valueLabel={zone.city ?? null}
        onChange={(v) => onChange({ city: v })}
        loadOptions={loadCities}
        placeholder={t('online.allCities')}
        searchPlaceholder={t('online.searchCity')}
        clearLabel={t('online.allCities')}
        disabled={!zone.region}
      />
      <span className={`scope${scopeClass}`}>{scopeLabel}</span>
      <Input
        inputMode="numeric"
        value={zone.fee ? String(zone.fee) : ''}
        placeholder={t('online.zoneFeePh')}
        onChange={(e) => onChange({ fee: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
      />
      <button type="button" className="rm" title={t('online.zoneName')} onClick={onRemove}>
        {ICO.trash}
      </button>
    </div>
  )
}

function SeoPane({ t, form, set, host }: PaneProps & { host: string }) {
  return (
    <>
      <div className="card">
        <CardHead
          icon={ICO.globe}
          title={t('online.seoListingTitle')}
          sub={t('online.seoListingBody')}
        />
        <Fld label={t('online.storeTitle')}>
          <Input value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} />
        </Fld>
        <Fld label={t('online.metaDesc')}>
          <textarea
            className="input"
            rows={3}
            style={{ height: 'auto', padding: '10px 12px' }}
            value={form.seoDescription}
            maxLength={300}
            onChange={(e) => set('seoDescription', e.target.value)}
          />
        </Fld>
        <div className="serp">
          <div className="u">{host}</div>
          <div className="t">{form.seoTitle || form.storeName || t('online.yourStoreTitle')}</div>
          <div className="d">{form.seoDescription || t('online.yourStoreDesc')}</div>
        </div>
        <Fld label={t('online.ogImage')}>
          <FileUpload
            variant="image"
            value={form.ogImageUrl || null}
            onChange={(url) => set('ogImageUrl', url ?? '')}
            folder="online-store"
            label={t('online.ogImageCta')}
            hint={t('online.ogImageHint')}
          />
        </Fld>
        <SLine
          title={t('online.allowIndex')}
          desc={t('online.allowIndexDesc')}
          on={form.robotsIndex}
          onToggle={() => set('robotsIndex', !form.robotsIndex)}
        />
      </div>

      <div className="card">
        <CardHead icon={ICO.globe} title={t('online.socialsTitle')} sub={t('online.socialsBody')} />
        <div className="fld-row">
          <Fld label="Instagram">
            <Input
              value={form.socialInstagram}
              placeholder="boutique.mballa"
              onChange={(e) => set('socialInstagram', e.target.value)}
            />
          </Fld>
          <Fld label="Facebook">
            <Input
              value={form.socialFacebook}
              placeholder="boutiquemballa"
              onChange={(e) => set('socialFacebook', e.target.value)}
            />
          </Fld>
        </div>
        <div className="fld-row">
          <Fld label="X (Twitter)">
            <Input
              value={form.socialX}
              placeholder="boutiquemballa"
              onChange={(e) => set('socialX', e.target.value)}
            />
          </Fld>
          <Fld label="TikTok">
            <Input
              value={form.socialTiktok}
              placeholder="boutique.mballa"
              onChange={(e) => set('socialTiktok', e.target.value)}
            />
          </Fld>
        </div>
        <Fld label="LinkedIn" desc={t('online.socialsHint')}>
          <Input
            value={form.socialLinkedin}
            placeholder="company/boutique-mballa"
            onChange={(e) => set('socialLinkedin', e.target.value)}
          />
        </Fld>
      </div>
    </>
  )
}

/** Publish history + rollback (rendered inside the version-history modal). Each publish is an
 *  immutable version; restoring an older one republishes it as a new version. */
function PublishHistory({ t, onRestored }: { t: T; onRestored: () => void }) {
  const qc = useQueryClient()
  const lang = useLangStore((s) => s.lang)
  const [confirming, setConfirming] = useState<number | null>(null)

  const list = useQuery({
    queryKey: ['online', 'publications'],
    queryFn: () => dataClient.online.listPublications(),
    retry: false,
  })
  const restore = useMutation({
    mutationFn: (version: number) => dataClient.online.restorePublication(version),
    onSuccess: () => {
      setConfirming(null)
      void qc.invalidateQueries({ queryKey: ['online', 'store'] })
      void qc.invalidateQueries({ queryKey: ['online', 'publications'] })
      onRestored()
    },
  })

  const rows = list.data ?? []
  if (rows.length === 0) return <div className="reserved-note">{t('online.historyEmpty')}</div>

  return (
    <div>
      {rows.map((p, i) => (
        <div className="hrow" key={p.id}>
          <div className="hi">{ICO.history}</div>
          <div className="ht">
            <div className="t">
              v{p.version}
              {i === 0 ? <span className="live">{t('online.live2')}</span> : null}
            </div>
            <div className="d">
              {new Date(p.publishedAt).toLocaleString(lang)}
              {p.publishedByName ? ` · ${p.publishedByName}` : ''}
              {p.sourceVersion
                ? ` · ${t('online.restoredFrom').replace('{v}', String(p.sourceVersion))}`
                : ''}
            </div>
          </div>
          {i === 0 ? null : confirming === p.version ? (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <Button
                variant="primary"
                type="button"
                loading={restore.isPending}
                onClick={() => restore.mutate(p.version)}
              >
                {t('online.hRestoreConfirm')}
              </Button>
              <Button variant="soft" type="button" onClick={() => setConfirming(null)}>
                {t('online.hCancel')}
              </Button>
            </span>
          ) : (
            <Button variant="soft" type="button" onClick={() => setConfirming(p.version)}>
              {t('online.hRestore')}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
