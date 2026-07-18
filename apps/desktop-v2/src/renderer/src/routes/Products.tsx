import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Input, Modal, Select } from '@biztrack/ui/biztrack'
import type { DataTableColumn } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { LocalProduct, StockStatus } from '@shared/ipc'

function marginInfo(p: LocalProduct): { text: string; good: boolean } {
  const cost = p.effectiveCostPrice
  const price = p.effectiveSellingPrice
  if (cost == null || cost <= 0 || price <= 0) return { text: '—', good: false }
  const pct = ((price - cost) / price) * 100
  return { text: `${pct.toFixed(1)}%`, good: pct > 0 }
}

/** Derived stock state for the status pill (mirrors the API/list-filter logic). */
function stockState(p: LocalProduct): 'in' | 'low' | 'out' | 'none' {
  if (!p.trackInventory) return 'none'
  const threshold = p.reorderPoint ?? p.lowStockThreshold ?? 0
  if (p.currentStock <= 0) return 'out'
  if (threshold > 0 && p.currentStock <= threshold) return 'low'
  return 'in'
}

type StatusFilter = 'all' | 'active' | 'inactive'

export function Products() {
  const t = useT()
  const bp = useBreakpoint()
  const money = useCurrency()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [categoryId, setCategoryId] = useState('')
  const [stockStatus, setStockStatus] = useState<StockStatus>('all')
  const [brandId, setBrandId] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const moreCount = (brandId ? 1 : 0) + (status !== 'all' ? 1 : 0)

  const {
    items: products,
    total,
    page,
    limit,
    totalPages,
    isPending,
    search,
    setSearch,
    setPage,
  } = usePaged<LocalProduct>(queryKeys.products, (q) => dataClient.products.list(q), {
    enabled: true,
    extra: {
      ...(categoryId ? { categoryId } : {}),
      ...(stockStatus !== 'all' ? { stockStatus } : {}),
      ...(brandId ? { brandId } : {}),
      ...(status !== 'all' ? { isActive: status === 'active' } : {}),
    },
  })

  const { data: stats } = useQuery({
    queryKey: [...queryKeys.products, 'stats'],
    queryFn: () => dataClient.products.stats(),
    enabled: true,
  })
  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: true,
  })
  const { data: brandPage } = useQuery({
    queryKey: [...queryKeys.brands, 'filter-list'],
    queryFn: () => dataClient.brands.list({ limit: 100, sortBy: 'name' }),
    enabled: filtersOpen,
  })

  const [deleteTarget, setDeleteTarget] = useState<LocalProduct | null>(null)
  const removeM = useMutation({
    mutationFn: (id: string) => dataClient.products.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.products }),
  })

  const openDetail = (id: string) => navigate(`/products/${id}`)
  const edit = (id: string) => navigate(`/products/${id}/edit`)
  const confirmDelete = async () => {
    if (!deleteTarget) return
    await removeM.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }
  const resetMore = () => {
    setBrandId('')
    setStatus('all')
    setPage(1)
  }

  const statusPill = (p: LocalProduct) => {
    const s = stockState(p)
    if (s === 'out')
      return (
        <span className="st st-out">
          <span className="d" />
          {t('prod.stockOut')}
        </span>
      )
    if (s === 'low')
      return (
        <span className="st st-low">
          <span className="d" />
          {t('prod.stockLow')}
        </span>
      )
    if (s === 'in')
      return (
        <span className="st st-ok">
          <span className="d" />
          {t('prod.stockIn')}
        </span>
      )
    return p.isActive ? (
      <span className="st st-brand">{t('prod.active')}</span>
    ) : (
      <span className="st st-neutral">{t('prod.inactive')}</span>
    )
  }
  const stockCell = (p: LocalProduct) => (p.trackInventory ? String(p.currentStock) : '—')

  const actions = (p: LocalProduct) => (
    <span className="acts" onClick={(e) => e.stopPropagation()}>
      <button title={t('prod.edit')} onClick={() => edit(p.id)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
          <path d="M14 6l4 4" />
        </svg>
      </button>
      <button
        title={t('prod.delete')}
        onClick={() => setDeleteTarget(p)}
        style={{ color: 'var(--danger)' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        </svg>
      </button>
    </span>
  )

  const productCell = (p: LocalProduct) => (
    <div className="cell">
      <span className="th">
        {p.imageUrl ? <img src={p.imageUrl} alt="" /> : p.name.slice(0, 2).toUpperCase()}
      </span>
      <div>
        <div className="nm" title={p.name}>
          {p.name}
        </div>
        <div className="sub">{p.sku ? `SKU · ${p.sku}` : t('prod.noSku')}</div>
      </div>
    </div>
  )

  const columns: DataTableColumn<LocalProduct>[] = [
    { key: 'product', header: t('prod.colProduct'), render: productCell },
    {
      key: 'category',
      header: t('prod.colCategory'),
      render: (p) => (p.categoryName ? <span className="chip-tag">{p.categoryName}</span> : '—'),
    },
    {
      key: 'cost',
      header: t('prod.colCost'),
      align: 'right',
      tdClassName: 'num',
      render: (p) => (p.effectiveCostPrice != null ? money.format(p.effectiveCostPrice) : '—'),
    },
    {
      key: 'price',
      header: t('prod.colPrice'),
      align: 'right',
      tdClassName: 'num',
      render: (p) => money.format(p.effectiveSellingPrice),
    },
    {
      key: 'margin',
      header: t('prod.colMargin'),
      align: 'right',
      tdClassName: 'num',
      render: (p) => {
        const m = marginInfo(p)
        return <span style={m.good ? { color: 'var(--success)' } : undefined}>{m.text}</span>
      },
    },
    {
      key: 'stock',
      header: t('prod.colStock'),
      align: 'right',
      tdClassName: 'num',
      render: stockCell,
    },
    { key: 'status', header: t('prod.colStatus'), render: statusPill },
    { key: 'actions', header: t('prod.colActions'), align: 'right', render: actions },
  ]

  // Extra filters (brand + active status) — shared by the desktop toolbar and the mobile header.
  const filterControl = (
    <div className="flt-wrap">
      <button
        type="button"
        className={`icon-btn${moreCount > 0 || filtersOpen ? ' on' : ''}`}
        title={t('prod.moreFilters')}
        onClick={() => setFiltersOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        {moreCount > 0 ? <span className="dot">{moreCount}</span> : null}
      </button>
      {filtersOpen ? (
        <>
          <div className="flt-backdrop" onClick={() => setFiltersOpen(false)} />
          <div className="flt-pop" role="dialog">
            <div className="ff">
              <label className="lbl2">{t('prod.colBrand')}</label>
              <Select
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">{t('prod.allBrands')}</option>
                {(brandPage?.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="ff">
              <label className="lbl2">{t('prod.colStatus')}</label>
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as StatusFilter)
                  setPage(1)
                }}
              >
                <option value="all">{t('prod.statusAll')}</option>
                <option value="active">{t('prod.active')}</option>
                <option value="inactive">{t('prod.inactive')}</option>
              </Select>
            </div>
            <div className="flt-foot">
              <button type="button" className="flt-clear" onClick={resetMore}>
                {t('prod.clearFilters')}
              </button>
              <Button variant="soft" onClick={() => setFiltersOpen(false)}>
                {t('prod.done')}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )

  // --- mobile: header + search + filter chips + tappable list + FAB ---------
  if (bp === 'mobile') {
    const mPill = (p: LocalProduct) => {
      const s = stockState(p)
      if (s === 'out')
        return (
          <span className="mst mst-out">
            <span className="d" />
            {t('prod.stockOut')}
          </span>
        )
      if (s === 'low')
        return (
          <span className="mst mst-low">
            <span className="d" />
            {t('prod.stockLow')}
          </span>
        )
      if (s === 'in')
        return (
          <span className="mst mst-ok">
            <span className="d" />
            {t('prod.stockIn')}
          </span>
        )
      return (
        <span className="mst mst-neutral">
          <span className="d" />
          {p.isActive ? t('prod.active') : t('prod.inactive')}
        </span>
      )
    }
    return (
      <>
        <header className="m-head">
          <div className="m-tt">
            <div className="m-title">{t('prod.title')}</div>
            <div className="m-sub">
              {stats
                ? t('prod.subtitleStats')
                    .replace('{n}', String(stats.totalSkus))
                    .replace('{c}', String(stats.categories))
                : t('prod.subtitle')}
            </div>
          </div>
          {filterControl}
        </header>

        <div className="msearch" style={{ marginBottom: 13 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 3 3" />
          </svg>
          <input
            value={search}
            placeholder={t('prod.search')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mchips" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={`mchip${categoryId === '' && stockStatus === 'all' ? ' active' : ''}`}
            onClick={() => {
              setCategoryId('')
              setStockStatus('all')
              setPage(1)
            }}
          >
            {t('prod.allCategories')}
          </button>
          <button
            type="button"
            className={`mchip${stockStatus === 'low' ? ' active' : ''}`}
            onClick={() => {
              setStockStatus(stockStatus === 'low' ? 'all' : 'low')
              setPage(1)
            }}
          >
            {t('prod.stockLow')}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`mchip${categoryId === c.id ? ' active' : ''}`}
              onClick={() => {
                setCategoryId(categoryId === c.id ? '' : c.id)
                setPage(1)
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="mlist">
          {products.map((p) => (
            <button key={p.id} type="button" className="mrow" onClick={() => openDetail(p.id)}>
              <div className="th">
                {p.imageUrl ? <img src={p.imageUrl} alt="" /> : p.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="mt">
                <div className="nm">{p.name}</div>
                <div className="sub">
                  {p.sku ? p.sku : t('prod.noSku')}
                  {p.categoryName ? ` · ${p.categoryName}` : ''}
                </div>
              </div>
              <div className="rt">
                <div className="v">{money.format(p.effectiveSellingPrice)}</div>
                <div className="s">{mPill(p)}</div>
              </div>
              <svg
                className="chev"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ))}
          {!isPending && products.length === 0 ? (
            <div className="mrow" style={{ cursor: 'default' }}>
              <div className="mt">
                <div className="sub">{t('prod.empty')}</div>
              </div>
            </div>
          ) : null}
          {isPending && products.length === 0 ? (
            <div className="mrow" style={{ cursor: 'default' }}>
              <div className="mt">
                <div className="sub">{t('prod.loading')}</div>
              </div>
            </div>
          ) : null}
        </div>

        {totalPages > 1 ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button
              type="button"
              className="mbtn"
              style={{ width: 'auto', padding: '0 18px' }}
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t('common.prev')}
            </button>
            <button
              type="button"
              className="mbtn"
              style={{ width: 'auto', padding: '0 18px' }}
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              {t('common.next')}
            </button>
          </div>
        ) : null}

        <div style={{ height: 76 }} />
        <button
          type="button"
          className="mfab"
          onClick={() => navigate('/products/new')}
          aria-label={t('prod.new')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('prod.title')}</h1>
          <p>
            {stats
              ? t('prod.subtitleStats')
                  .replace('{n}', String(stats.totalSkus))
                  .replace('{c}', String(stats.categories))
              : t('prod.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* CSV import isn't built yet — shown per design, disabled + flagged. */}
          <Button variant="default" disabled title={t('prod.importSoon')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 3v12M7 10l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            {t('prod.import')}
          </Button>
          <Button variant="primary" onClick={() => navigate('/products/new')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('prod.new')}
          </Button>
        </div>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">{t('prod.kpiCatalog')}</div>
          <div className="v">{stats ? money.compact(stats.catalogValueCost) : '—'}</div>
          <div className="h">
            {t('prod.kpiCatalogHint').replace('{n}', String(stats?.totalSkus ?? 0))}
          </div>
        </div>
        <div className="m">
          <div className="k">{t('prod.kpiRetail')}</div>
          <div className="v">{stats ? money.compact(stats.retailValue) : '—'}</div>
          <div className="h">
            {t('prod.kpiRetailHint').replace('{p}', (stats?.blendedMarginPct ?? 0).toFixed(1))}
          </div>
        </div>
        <div className="m">
          <div className="k">
            {t('prod.kpiLow')}
            {stats && stats.lowStock > 0 ? (
              <span className="badge b-warn">{stats.lowStock}</span>
            ) : null}
          </div>
          <div className="v">{stats?.lowStock ?? 0}</div>
          <div className="h">{t('prod.kpiLowHint')}</div>
        </div>
        <div className="m">
          <div className="k">
            {t('prod.kpiOut')}
            {stats && stats.outOfStock > 0 ? (
              <span className="badge b-down">{stats.outOfStock}</span>
            ) : null}
          </div>
          <div className="v">{stats?.outOfStock ?? 0}</div>
          <div className="h">{t('prod.kpiOutHint')}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="field grow">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 3 3" />
          </svg>
          <Input
            className="ic"
            value={search}
            placeholder={t('prod.search')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">{t('prod.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={stockStatus}
          onChange={(e) => {
            setStockStatus(e.target.value as StockStatus)
            setPage(1)
          }}
        >
          <option value="all">{t('prod.allStock')}</option>
          <option value="in">{t('prod.stockIn')}</option>
          <option value="low">{t('prod.stockLow')}</option>
          <option value="out">{t('prod.stockOut')}</option>
        </Select>

        {filterControl}
      </div>

      <DataTable<LocalProduct>
        columns={columns}
        rows={products}
        rowKey={(p) => p.id}
        onRowClick={(p) => openDetail(p.id)}
        loading={isPending}
        loadingText={t('prod.loading')}
        empty={t('prod.empty')}
        title={t('prod.all')}
        countLabel={t('prod.count').replace('{n}', String(total))}
        pagination={{
          page,
          totalPages,
          total,
          limit,
          onPage: setPage,
          prevLabel: t('common.prev'),
          nextLabel: t('common.next'),
        }}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('prod.deleteTitle')}
        footer={
          <>
            <Button
              variant="soft"
              onClick={() => setDeleteTarget(null)}
              disabled={removeM.isPending}
            >
              {t('prod.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={removeM.isPending}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => void confirmDelete()}
            >
              {t('prod.delete')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('prod.deleteBody').replace('{name}', deleteTarget?.name ?? '')}
        </p>
      </Modal>
    </div>
  )
}
