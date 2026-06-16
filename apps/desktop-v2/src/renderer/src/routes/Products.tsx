import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Pagination, Select } from '@biztrack/ui/biztrack'
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

function margin(p: LocalProduct): string {
  if (p.costPrice == null || p.costPrice <= 0 || p.sellingPrice <= 0) return '—'
  return `${(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(1)}%`
}

/** Derived stock state for the status pill (mirrors the API/list-filter logic). */
function stockState(p: LocalProduct): 'in' | 'low' | 'out' | 'none' {
  if (!p.trackInventory) return 'none'
  const threshold = p.reorderPoint ?? p.lowStockThreshold ?? 0
  if (p.currentStock <= 0) return 'out'
  if (threshold > 0 && p.currentStock <= threshold) return 'low'
  return 'in'
}

export function Products() {
  const t = useT()
  const bp = useBreakpoint()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [categoryId, setCategoryId] = useState('')
  const [stockStatus, setStockStatus] = useState<StockStatus>('all')
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

  const [deleteTarget, setDeleteTarget] = useState<LocalProduct | null>(null)
  const removeM = useMutation({
    mutationFn: (id: string) => dataClient.products.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.products }),
  })

  const edit = (id: string) => navigate(`/products/${id}`)
  const confirmDelete = async () => {
    if (!deleteTarget) return
    await removeM.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
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
    <span className="acts">
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
        <Button variant="primary" onClick={() => navigate('/products/new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('prod.new')}
        </Button>
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
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('prod.all')}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="chip-tag">{t('prod.count').replace('{n}', String(total))}</span>
        </div>

        {isPending ? (
          <div className="cat-empty">{t('prod.loading')}</div>
        ) : products.length === 0 ? (
          <div className="cat-empty">{t('prod.empty')}</div>
        ) : bp === 'mobile' ? (
          <div className="u-cards">
            {products.map((p) => (
              <div key={p.id} className="u-card">
                <span className="u-abbr">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="ava-img" /> : p.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="u-main">
                  <div className="u-nm">{p.name}</div>
                  <div className="u-sub">
                    {p.categoryName ? <span className="chip-tag">{p.categoryName}</span> : null}
                    <span className="mono">{formatXAF(p.sellingPrice)}</span>
                    {statusPill(p)}
                  </div>
                </div>
                {actions(p)}
              </div>
            ))}
          </div>
        ) : (
          <table className="utbl">
            <thead>
              <tr>
                <th>{t('prod.colProduct')}</th>
                <th>{t('prod.colCategory')}</th>
                <th>{t('prod.colBrand')}</th>
                <th className="right">{t('prod.colCost')}</th>
                <th className="right">{t('prod.colPrice')}</th>
                <th className="right">{t('prod.colMargin')}</th>
                <th className="right">{t('prod.colStock')}</th>
                <th>{t('prod.colStatus')}</th>
                <th className="right">{t('prod.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="u-cell">
                      <span className="u-abbr">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="ava-img" /> : p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="u-nm">{p.name}</div>
                        <div className="sub" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {p.sku ? `SKU · ${p.sku}` : t('prod.noSku')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{p.categoryName ? <span className="chip-tag">{p.categoryName}</span> : '—'}</td>
                  <td className="mono">{p.brandName ?? '—'}</td>
                  <td className="right mono">{p.costPrice != null ? formatXAF(p.costPrice) : '—'}</td>
                  <td className="right mono">{formatXAF(p.sellingPrice)}</td>
                  <td className="right mono">{margin(p)}</td>
                  <td className="right mono">{stockCell(p)}</td>
                  <td>{statusPill(p)}</td>
                  <td className="right">{actions(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPage={setPage}
          prevLabel={t('common.prev')}
          nextLabel={t('common.next')}
        />
      </div>

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
