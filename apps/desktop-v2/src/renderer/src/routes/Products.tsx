import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Input, Modal, Select } from '@biztrack/ui/biztrack'
import type { DataTableColumn } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { LocalProduct, StockStatus } from '@shared/ipc'

const XAF = new Intl.NumberFormat('fr-CM', { maximumFractionDigits: 0 })
const formatXAF = (n: number) => `${XAF.format(n)} FCFA`
function compactXAF(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M FCFA`
  if (n >= 10_000) return `${Math.round(n / 1000)}K FCFA`
  return `${XAF.format(n)} FCFA`
}

function marginInfo(p: LocalProduct): { text: string; good: boolean } {
  if (p.costPrice == null || p.costPrice <= 0 || p.sellingPrice <= 0) return { text: '—', good: false }
  const pct = ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100
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
    enabled: isElectron,
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
    enabled: isElectron,
  })
  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: isElectron,
  })
  const { data: brandPage } = useQuery({
    queryKey: [...queryKeys.brands, 'filter-list'],
    queryFn: () => dataClient.brands.list({ limit: 100, sortBy: 'name' }),
    enabled: isElectron && filtersOpen,
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
    if (s === 'out') return <span className="st st-out"><span className="d" />{t('prod.stockOut')}</span>
    if (s === 'low') return <span className="st st-low"><span className="d" />{t('prod.stockLow')}</span>
    if (s === 'in') return <span className="st st-ok"><span className="d" />{t('prod.stockIn')}</span>
    return p.isActive ? <span className="st st-brand">{t('prod.active')}</span> : <span className="st st-neutral">{t('prod.inactive')}</span>
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
      <button title={t('prod.delete')} onClick={() => setDeleteTarget(p)} style={{ color: 'var(--danger)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        </svg>
      </button>
    </span>
  )

  const productCell = (p: LocalProduct) => (
    <div className="cell">
      <span className="th">{p.imageUrl ? <img src={p.imageUrl} alt="" /> : p.name.slice(0, 2).toUpperCase()}</span>
      <div>
        <div className="nm">{p.name}</div>
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
    { key: 'cost', header: t('prod.colCost'), align: 'right', tdClassName: 'num', render: (p) => (p.costPrice != null ? formatXAF(p.costPrice) : '—') },
    { key: 'price', header: t('prod.colPrice'), align: 'right', tdClassName: 'num', render: (p) => formatXAF(p.sellingPrice) },
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
    { key: 'stock', header: t('prod.colStock'), align: 'right', tdClassName: 'num', render: stockCell },
    { key: 'status', header: t('prod.colStatus'), render: statusPill },
    { key: 'actions', header: t('prod.colActions'), align: 'right', render: actions },
  ]

  const mobileCard = (p: LocalProduct) => (
    <div className="u-card clickable" onClick={() => openDetail(p.id)}>
      <span className="th">{p.imageUrl ? <img src={p.imageUrl} alt="" /> : p.name.slice(0, 2).toUpperCase()}</span>
      <div className="u-main">
        <div className="u-nm">{p.name}</div>
        <div className="u-sub">
          {p.categoryName ? <span className="chip-tag">{p.categoryName}</span> : null}
          <span className="num">{formatXAF(p.sellingPrice)}</span>
          {statusPill(p)}
        </div>
      </div>
      {actions(p)}
    </div>
  )

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('prod.title')}</h1>
          <p>
            {stats
              ? t('prod.subtitleStats').replace('{n}', String(stats.totalSkus)).replace('{c}', String(stats.categories))
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
          <div className="v">{stats ? compactXAF(stats.catalogValueCost) : '—'}</div>
          <div className="h">{t('prod.kpiCatalogHint').replace('{n}', String(stats?.totalSkus ?? 0))}</div>
        </div>
        <div className="m">
          <div className="k">{t('prod.kpiRetail')}</div>
          <div className="v">{stats ? compactXAF(stats.retailValue) : '—'}</div>
          <div className="h">{t('prod.kpiRetailHint').replace('{p}', (stats?.blendedMarginPct ?? 0).toFixed(1))}</div>
        </div>
        <div className="m">
          <div className="k">
            {t('prod.kpiLow')}
            {stats && stats.lowStock > 0 ? <span className="badge b-warn">{stats.lowStock}</span> : null}
          </div>
          <div className="v">{stats?.lowStock ?? 0}</div>
          <div className="h">{t('prod.kpiLowHint')}</div>
        </div>
        <div className="m">
          <div className="k">
            {t('prod.kpiOut')}
            {stats && stats.outOfStock > 0 ? <span className="badge b-down">{stats.outOfStock}</span> : null}
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
          <Input className="ic" value={search} placeholder={t('prod.search')} onChange={(e) => setSearch(e.target.value)} />
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
        mobile={bp === 'mobile'}
        renderMobileCard={mobileCard}
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
            <Button variant="soft" onClick={() => setDeleteTarget(null)} disabled={removeM.isPending}>
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
