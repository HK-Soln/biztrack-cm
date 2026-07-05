import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { checkProductPublishable, type ProductPublishBlocker } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { OnlineError, OnlineUpsell, isPlanUpgrade } from '@/components/online/OnlineStates'
import type { OnlineAdminProduct, OnlineStore } from '@shared/ipc'

type Tab = 'all' | 'published' | 'draft'
const TABS: Tab[] = ['all', 'published', 'draft']

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

function initials(name?: string | null): string {
  const p = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '—'
}

function blockerLabel(t: ReturnType<typeof useT>, b: ProductPublishBlocker): string {
  switch (b) {
    case 'inactive':
      return t('online.blocker.inactive')
    case 'no_price':
      return t('online.blocker.noPrice')
    case 'no_image':
      return t('online.blocker.noImage')
    default:
      return b
  }
}

/** Store-status pill shown in the header — reflects whether the storefront is live. */
function storeMeta(
  t: ReturnType<typeof useT>,
  store: OnlineStore | null | undefined,
): { label: string; hint: string } {
  if (!store) return { label: t('online.pStoreNone'), hint: t('online.pStoreNoneHint') }
  if (store.status === 'published') {
    return {
      label: t('online.pStoreLive'),
      hint: store.hasUnpublishedChanges ? t('online.pStorePending') : `/${store.storeSlug}`,
    }
  }
  if (store.status === 'suspended')
    return { label: t('online.pStoreSuspended'), hint: `/${store.storeSlug}` }
  return { label: t('online.pStoreDraft'), hint: t('online.pStoreDraftHint') }
}

/** Publish-state badge for a product row (Draft / Live / needs attention). */
function rowStatus(
  t: ReturnType<typeof useT>,
  p: OnlineAdminProduct,
): { label: string; cls: string; blockers: ProductPublishBlocker[] } {
  const { ready, blockers } = checkProductPublishable({
    isActive: p.isActive,
    sellingPrice: p.sellingPrice,
    imageUrl: p.imageUrl,
  })
  if (!p.isPublishedOnline) return { label: t('online.pDraft'), cls: 'st-neutral', blockers }
  if (ready) return { label: t('online.pLive'), cls: 'st-ok', blockers: [] }
  return { label: t('online.pIssues'), cls: 'st-out', blockers }
}

function Thumb({ p }: { p: OnlineAdminProduct }) {
  return (
    <div className="av">
      {p.imageUrl ? (
        <img
          src={p.imageUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
        />
      ) : (
        initials(p.name)
      )}
    </div>
  )
}

export function OnlineProducts() {
  const t = useT()
  const bp = useBreakpoint()
  const money = useCurrency()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(id)
  }, [toast])

  const published = tab === 'published' ? true : tab === 'draft' ? false : undefined

  const store = useQuery({
    queryKey: ['online', 'store'],
    queryFn: () => dataClient.online.getStore(),
    retry: false,
  })
  const list = useQuery({
    queryKey: ['online', 'products', tab, search],
    queryFn: () =>
      dataClient.online.listProducts({ published, search: search.trim() || undefined, limit: 100 }),
    retry: false,
  })
  // Header counts — tiny (limit 1) queries so totals stay stable across tab/search.
  const publishedCount = useQuery({
    queryKey: ['online', 'products', 'count', true],
    queryFn: () => dataClient.online.listProducts({ published: true, limit: 1 }),
    retry: false,
  })
  const draftCount = useQuery({
    queryKey: ['online', 'products', 'count', false],
    queryFn: () => dataClient.online.listProducts({ published: false, limit: 1 }),
    retry: false,
  })

  const publish = useMutation({
    mutationFn: (v: { id: string; published: boolean }) =>
      dataClient.online.setProductPublished(v.id, v.published),
    onSuccess: (_data, v) => {
      setToast(v.published ? t('online.pPublishedToast') : t('online.pUnpublishedToast'))
      qc.invalidateQueries({ queryKey: ['online', 'products'] })
    },
    onError: () => setToast(t('online.pPublishFailed')),
  })

  // Plan gate — mirrors Online Orders/Store: FREE/SOLO get the upsell.
  if ((store.error && isPlanUpgrade(store.error)) || (list.error && isPlanUpgrade(list.error)))
    return <OnlineUpsell />

  const rows = list.data?.data ?? []
  const sm = storeMeta(t, store.data)
  const pubTotal = publishedCount.data?.total ?? 0
  const draftTotal = draftCount.data?.total ?? 0

  // Publishing is gated on storefront-readiness: pre-check here (no API round-trip) and toast
  // the reason if not ready, exactly as the API enforces. Unpublishing is always allowed.
  const onToggle = (p: OnlineAdminProduct) => {
    if (!p.isPublishedOnline) {
      const { ready, blockers } = checkProductPublishable({
        isActive: p.isActive,
        sellingPrice: p.sellingPrice,
        imageUrl: p.imageUrl,
      })
      if (!ready) {
        setToast(
          t('online.pBlockedToast').replace(
            '{reasons}',
            blockers.map((b) => blockerLabel(t, b)).join(', '),
          ),
        )
        return
      }
    }
    publish.mutate({ id: p.id, published: !p.isPublishedOnline })
  }

  const actionLabel = (p: OnlineAdminProduct) =>
    p.isPublishedOnline ? t('online.pUnpublish') : t('online.pPublish')

  const openProduct = (p: OnlineAdminProduct) => navigate(`/products/${p.id}`)

  const Toast = toast ? (
    <div className="sc-toast show">
      {CHECK}
      <span>{toast}</span>
    </div>
  ) : null

  // ---------- mobile ----------
  if (bp === 'mobile') {
    return (
      <>
        <header className="m-head">
          <button
            type="button"
            className="back"
            onClick={() => navigate(-1)}
            aria-label={t('common.back')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div className="m-tt">
            <div className="m-title">{t('online.productsTitle')}</div>
            <div className="m-sub">{sm.label}</div>
          </div>
        </header>

        <div className="mkpis" style={{ marginBottom: 16 }}>
          <div className="mkpi">
            <div className="v" style={{ color: 'var(--success)' }}>
              {pubTotal}
            </div>
            <div className="k">{t('online.pLive')}</div>
          </div>
          <div className="mkpi">
            <div className="v">{draftTotal}</div>
            <div className="k">{t('online.pDraft')}</div>
          </div>
        </div>

        {list.error ? (
          <OnlineError error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <>
            <div className="mchips" style={{ marginBottom: 12 }}>
              {TABS.map((tb) => (
                <button
                  key={tb}
                  type="button"
                  className={`mchip${tab === tb ? ' active' : ''}`}
                  onClick={() => setTab(tb)}
                >
                  {t(`online.pTab_${tb}`)}
                </button>
              ))}
            </div>
            <div className="mlist">
              {!list.isPending && rows.length === 0 ? (
                <div className="mrow" style={{ cursor: 'default' }}>
                  <div className="mt">
                    <div className="sub">{t('online.pNone')}</div>
                  </div>
                </div>
              ) : null}
              {rows.map((p) => {
                const st = rowStatus(t, p)
                return (
                  <div key={p.id} className="mrow" style={{ cursor: 'default' }}>
                    <button
                      type="button"
                      className="th brand round"
                      style={{ color: 'inherit' }}
                      onClick={() => openProduct(p)}
                      aria-label={p.name}
                    >
                      <Thumb p={p} />
                    </button>
                    <button
                      type="button"
                      className="mt"
                      style={{
                        textAlign: 'left',
                        background: 'none',
                        border: 0,
                        padding: 0,
                        color: 'inherit',
                        font: 'inherit',
                      }}
                      onClick={() => openProduct(p)}
                    >
                      <div className="nm">{p.name}</div>
                      <div className="sub">
                        {money.format(p.sellingPrice)}
                        {' · '}
                        <span className={`mst ${st.cls.replace('st-', 'mst-')}`}>
                          <span className="d" />
                          {st.label}
                        </span>
                      </div>
                    </button>
                    <div className="rt">
                      <Button
                        variant={p.isPublishedOnline ? 'soft' : 'primary'}
                        type="button"
                        loading={publish.isPending && publish.variables?.id === p.id}
                        onClick={() => onToggle(p)}
                      >
                        {actionLabel(p)}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
        {Toast}
      </>
    )
  }

  // ---------- desktop / tablet ----------
  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('online.productsTitle')}</h1>
          <p>{t('online.productsSubtitle')}</p>
        </div>
        <Button variant="soft" type="button" onClick={() => navigate('/online/store')}>
          {t('online.pManageStore')}
        </Button>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">{t('online.pLive')}</div>
          <div className="v" style={{ color: 'var(--success)' }}>
            {pubTotal}
          </div>
          <div className="h">{t('online.pLiveHint')}</div>
        </div>
        <div className="m">
          <div className="k">{t('online.pDraft')}</div>
          <div className="v">{draftTotal}</div>
          <div className="h">{t('online.pDraftCountHint')}</div>
        </div>
        <div className="m">
          <div className="k">{t('online.pStore')}</div>
          <div className="v" style={{ fontSize: 18 }}>
            {sm.label}
          </div>
          <div className="h">{sm.hint}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('online.pCatalog')}</h3>
          <div className="field" style={{ flex: 1, minWidth: 200, marginLeft: 16 }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 3 3" />
            </svg>
            <input
              className="input ic"
              style={{ height: 36 }}
              placeholder={t('online.pSearch')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select"
            style={{ height: 36 }}
            value={tab}
            onChange={(e) => setTab(e.target.value as Tab)}
          >
            {TABS.map((tb) => (
              <option key={tb} value={tb}>
                {t(`online.pTab_${tb}`)}
              </option>
            ))}
          </select>
        </div>

        {list.error ? (
          <OnlineError error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <>
            <table className="ltbl">
              <thead>
                <tr>
                  <th>{t('online.pColProduct')}</th>
                  <th>{t('online.pColCategory')}</th>
                  <th className="right">{t('online.pColPrice')}</th>
                  <th className="center">{t('online.pColStock')}</th>
                  <th>{t('online.pColStatus')}</th>
                  <th className="right">{t('online.pColAction')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const st = rowStatus(t, p)
                  return (
                    <tr key={p.id}>
                      <td>
                        <button
                          type="button"
                          className="ord-cust"
                          style={{
                            background: 'none',
                            border: 0,
                            padding: 0,
                            cursor: 'pointer',
                            textAlign: 'left',
                            color: 'inherit',
                            font: 'inherit',
                          }}
                          onClick={() => openProduct(p)}
                        >
                          <Thumb p={p} />
                          <div>
                            <div className="nm">{p.name}</div>
                            <div className="sub">{p.sku ?? '—'}</div>
                          </div>
                        </button>
                      </td>
                      <td>{p.categoryName ?? '—'}</td>
                      <td className="right num">{money.format(p.sellingPrice)}</td>
                      <td className="center">{p.trackInventory ? p.inStock : '—'}</td>
                      <td>
                        <span
                          className={`st ${st.cls}`}
                          title={st.blockers.map((b) => blockerLabel(t, b)).join(', ')}
                        >
                          <span className="d" />
                          {st.label}
                          {st.blockers.length > 0
                            ? ` · ${st.blockers.map((b) => blockerLabel(t, b)).join(', ')}`
                            : ''}
                        </span>
                      </td>
                      <td className="right">
                        <Button
                          variant={p.isPublishedOnline ? 'soft' : 'primary'}
                          type="button"
                          loading={publish.isPending && publish.variables?.id === p.id}
                          onClick={() => onToggle(p)}
                        >
                          {actionLabel(p)}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!list.isPending && rows.length === 0 ? (
              <div className="cat-empty" style={{ padding: 28 }}>
                {t('online.pNone')}
              </div>
            ) : null}
            <div className="panel-foot">
              <span>{t('online.pFoot').replace('{n}', String(rows.length))}</span>
            </div>
          </>
        )}
      </div>
      {Toast}
    </div>
  )
}
