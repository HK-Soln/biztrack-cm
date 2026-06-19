import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Input, Select } from '@biztrack/ui/biztrack'
import type { DataTableColumn } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { LocalInventoryItem, StockStatus } from '@shared/ipc'

type Tab = Extract<StockStatus, 'all' | 'low' | 'out'>

/** Stock-health bar fill % (small for out, scales toward the threshold otherwise). */
function fillPct(it: LocalInventoryItem): number {
  if (it.currentStock <= 0) return 4
  const thr = it.reorderPoint ?? it.lowStockThreshold ?? 0
  if (thr > 0) return Math.max(8, Math.min(100, Math.round((it.currentStock / thr) * 100)))
  return 92
}

export function Inventory() {
  const t = useT()
  const bp = useBreakpoint()
  const money = useCurrency()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('all')
  const [categoryId, setCategoryId] = useState('')

  const {
    items,
    total,
    page,
    limit,
    totalPages,
    isPending,
    search,
    setSearch,
    setPage,
  } = usePaged<LocalInventoryItem>(queryKeys.inventory, (q) => dataClient.inventory.list(q), {
    enabled: isElectron,
    extra: {
      ...(tab !== 'all' ? { stockStatus: tab } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
  })

  const { data: stats } = useQuery({
    queryKey: [...queryKeys.inventory, 'stats'],
    queryFn: () => dataClient.inventory.stats(),
    enabled: isElectron,
  })
  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: isElectron,
  })

  const open = (id: string) => navigate(`/products/${id}`)
  const attention = (stats?.lowStock ?? 0) + (stats?.outOfStock ?? 0)

  const onHandCell = (it: LocalInventoryItem) => (
    <span style={{ color: it.stockStatus === 'out' ? 'var(--danger)' : it.stockStatus === 'low' ? 'var(--warning)' : undefined }}>
      {it.currentStock}
    </span>
  )
  const healthCell = (it: LocalInventoryItem) => (
    <div className="sbar"><i className={it.stockStatus === 'out' ? 'out' : it.stockStatus === 'low' ? 'low' : ''} style={{ width: `${fillPct(it)}%` }} /></div>
  )
  const productCell = (it: LocalInventoryItem) => (
    <div className="cell">
      <span className="th">{it.imageUrl ? <img src={it.imageUrl} alt="" /> : it.name.slice(0, 2).toUpperCase()}</span>
      <div>
        <div className="nm">{it.name}</div>
        <div className="sub">{it.categoryName ?? (it.sku ? `SKU · ${it.sku}` : '—')}</div>
      </div>
    </div>
  )

  const columns: DataTableColumn<LocalInventoryItem>[] = [
    { key: 'product', header: t('inv.colProduct'), render: productCell },
    { key: 'onhand', header: t('inv.colOnHand'), align: 'right', tdClassName: 'num', render: onHandCell },
    { key: 'reorder', header: t('inv.colReorder'), align: 'right', tdClassName: 'num', render: (it) => (it.reorderPoint ?? it.lowStockThreshold ?? '—') },
    { key: 'health', header: t('inv.colHealth'), render: healthCell },
    { key: 'value', header: t('inv.colValue'), align: 'right', tdClassName: 'num', render: (it) => money.format(it.stockValueCost) },
  ]

  const mobileCard = (it: LocalInventoryItem) => (
    <div className="u-card clickable" onClick={() => open(it.productId)}>
      <span className="th">{it.imageUrl ? <img src={it.imageUrl} alt="" /> : it.name.slice(0, 2).toUpperCase()}</span>
      <div className="u-main">
        <div className="u-nm">{it.name}</div>
        <div className="u-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="num" style={{ color: it.stockStatus === 'out' ? 'var(--danger)' : it.stockStatus === 'low' ? 'var(--warning)' : undefined }}>
            {t('inv.onHandN').replace('{n}', String(it.currentStock))}
          </span>
          <span style={{ flex: 1 }}><span className="sbar"><i className={it.stockStatus === 'out' ? 'out' : it.stockStatus === 'low' ? 'low' : ''} style={{ width: `${fillPct(it)}%` }} /></span></span>
        </div>
      </div>
    </div>
  )

  const tabBtn = (key: Tab, label: string, count?: number) => (
    <button type="button" className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setPage(1) }}>
      {label}
      {count != null ? <span className="cnt">{count}</span> : null}
    </button>
  )

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('nav.inventory')}</h1>
          <p>{t('inv.subtitle')}</p>
        </div>
      </div>

      <div className="minihead">
        <div className="m"><div className="k">{t('inv.kStockValue')}</div><div className="v">{stats ? money.compact(stats.stockValueCost) : '—'}</div><div className="h">{t('inv.kAcrossSkus').replace('{n}', String(stats?.trackedSkus ?? 0))}</div></div>
        <div className="m"><div className="k">{t('inv.kUnits')}</div><div className="v">{stats ? stats.unitsOnHand.toLocaleString() : '—'}</div><div className="h">{t('inv.kOnHand')}</div></div>
        <div className="m"><div className="k">{t('inv.kLow')} {stats && stats.lowStock > 0 ? <span className="badge b-warn">{stats.lowStock}</span> : null}</div><div className="v">{stats?.lowStock ?? 0}</div><div className="h">{t('inv.kBelowReorder')}</div></div>
        <div className="m"><div className="k">{t('inv.kOut')} {stats && stats.outOfStock > 0 ? <span className="badge b-down">{stats.outOfStock}</span> : null}</div><div className="v">{stats?.outOfStock ?? 0}</div><div className="h">{t('inv.kLostSales')}</div></div>
      </div>

      {attention > 0 ? (
        <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--warning)' }}>{t('inv.bannerTitle').replace('{n}', String(attention))}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{t('inv.bannerSub')}</div>
          </div>
          <button type="button" className="btn" style={{ background: 'var(--surface)' }} onClick={() => { setTab('low'); setPage(1) }}>{t('inv.bannerAction')}</button>
        </div>
      ) : null}

      <div className="tabs">
        {tabBtn('all', t('inv.tabAll'), stats?.trackedSkus)}
        {tabBtn('low', t('inv.tabLow'), stats?.lowStock)}
        {tabBtn('out', t('inv.tabOut'), stats?.outOfStock)}
      </div>

      <DataTable<LocalInventoryItem>
        columns={columns}
        rows={items}
        rowKey={(it) => it.productId}
        onRowClick={(it) => open(it.productId)}
        loading={isPending}
        loadingText={t('inv.loading')}
        title={t('inv.stockLevels')}
        countLabel={t('inv.countItems').replace('{n}', String(total))}
        empty={t('inv.empty')}
        mobile={bp === 'mobile'}
        renderMobileCard={mobileCard}
        toolbar={
          <>
            <div className="field" style={{ width: 220 }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>
              <Input className="ic" placeholder={t('inv.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ height: 36 }} />
            </div>
            <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }} style={{ height: 36, maxWidth: 180 }}>
              <option value="">{t('inv.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </>
        }
        pagination={{ page, limit, total, totalPages, onPage: setPage, prevLabel: t('common.prev'), nextLabel: t('common.next') }}
      />
    </div>
  )
}
