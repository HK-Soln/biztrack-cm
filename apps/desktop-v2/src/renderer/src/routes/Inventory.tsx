import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, DataTable, Input, Select } from '@biztrack/ui/biztrack'
import type { DataTableColumn } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
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

  const { items, total, page, limit, totalPages, isPending, search, setSearch, setPage } =
    usePaged<LocalInventoryItem>(queryKeys.inventory, (q) => dataClient.inventory.list(q), {
      enabled: true,
      extra: {
        ...(tab !== 'all' ? { stockStatus: tab } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
    })

  const { data: stats } = useQuery({
    queryKey: [...queryKeys.inventory, 'stats'],
    queryFn: () => dataClient.inventory.stats(),
    enabled: true,
  })
  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: true,
  })
  const { data: suggestions = [] } = useQuery({
    queryKey: [...queryKeys.inventory, 'reorder'],
    queryFn: () => dataClient.inventory.reorderSuggestions(),
    enabled: true,
  })

  const open = (id: string) => navigate(`/products/${id}`)
  // Banner visibility tracks the low/out KPI (all products), not just the direct
  // auto-PO subset — so it shows whenever there's low stock. The PO auto-fills the
  // restockable (direct) products; if none, the PO modal explains.
  const attention = (stats?.lowStock ?? 0) + (stats?.outOfStock ?? 0)
  const estRestockCost = suggestions.reduce((s, x) => s + x.suggestedQty * (x.unitCost ?? 0), 0)

  const generatePO = () =>
    navigate('/purchasing/orders/new', {
      state: {
        seedItems: suggestions.map((s) => ({
          productId: s.productId,
          name: s.name,
          quantity: String(s.suggestedQty),
          unitPrice: s.unitCost != null ? String(s.unitCost) : '',
        })),
      },
    })

  const onHandCell = (it: LocalInventoryItem) => (
    <span
      style={{
        color:
          it.stockStatus === 'out'
            ? 'var(--danger)'
            : it.stockStatus === 'low'
              ? 'var(--warning)'
              : undefined,
      }}
    >
      {it.currentStock}
    </span>
  )
  const healthCell = (it: LocalInventoryItem) => (
    <div className="sbar">
      <i
        className={it.stockStatus === 'out' ? 'out' : it.stockStatus === 'low' ? 'low' : ''}
        style={{ width: `${fillPct(it)}%` }}
      />
    </div>
  )
  const productCell = (it: LocalInventoryItem) => (
    <div className="cell">
      <span className="th">
        {it.imageUrl ? <img src={it.imageUrl} alt="" /> : it.name.slice(0, 2).toUpperCase()}
      </span>
      <div>
        <div className="nm" title={it.name}>
          {it.name}
        </div>
        <div className="sub">{it.categoryName ?? (it.sku ? `SKU · ${it.sku}` : '—')}</div>
      </div>
    </div>
  )

  const columns: DataTableColumn<LocalInventoryItem>[] = [
    { key: 'product', header: t('inv.colProduct'), render: productCell },
    {
      key: 'onhand',
      header: t('inv.colOnHand'),
      align: 'right',
      tdClassName: 'num',
      render: onHandCell,
    },
    {
      key: 'reorder',
      header: t('inv.colReorder'),
      align: 'right',
      tdClassName: 'num',
      render: (it) => it.reorderPoint ?? it.lowStockThreshold ?? '—',
    },
    { key: 'health', header: t('inv.colHealth'), render: healthCell },
    {
      key: 'value',
      header: t('inv.colValue'),
      align: 'right',
      tdClassName: 'num',
      render: (it) => money.format(it.stockValueCost),
    },
  ]

  const tabBtn = (key: Tab, label: string, count?: number) => (
    <button
      type="button"
      className={tab === key ? 'active' : ''}
      onClick={() => {
        setTab(key)
        setPage(1)
      }}
    >
      {label}
      {count != null ? <span className="cnt">{count}</span> : null}
    </button>
  )

  // --- mobile: back header + KPIs + reorder alert + segmented filter + list ---
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
            <div className="m-title">{t('nav.inventory')}</div>
            <div className="m-sub">
              {stats
                ? `${money.compact(stats.stockValueCost)} · ${stats.unitsOnHand.toLocaleString()} ${t('inv.unitsWord')}`
                : t('inv.subtitle')}
            </div>
          </div>
        </header>

        <div className="mkpis" style={{ marginBottom: 16 }}>
          <div className="mkpi">
            <div className="top">
              <span className="ic w">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
              </span>
            </div>
            <div className="v">{stats?.lowStock ?? 0}</div>
            <div className="k">{t('inv.kLow')}</div>
          </div>
          <div className="mkpi">
            <div className="top">
              <span className="ic r">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M15 9l-6 6M9 9l6 6" />
                </svg>
              </span>
            </div>
            <div className="v">{stats?.outOfStock ?? 0}</div>
            <div className="k">{t('inv.kOut')}</div>
          </div>
        </div>

        {attention > 0 ? (
          <div
            className="mcard"
            style={{
              borderColor: 'var(--warning)',
              background: 'var(--warning-soft)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: 'var(--surface)',
                color: 'var(--warning)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--warning)' }}>
                {t('inv.bannerTitle').replace('{n}', String(attention))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>
                {estRestockCost > 0
                  ? t('inv.bannerSub').replace('{cost}', money.compact(estRestockCost))
                  : t('inv.bannerSubReview')}
              </div>
            </div>
            {suggestions.length > 0 ? (
              <button
                type="button"
                className="mbtn"
                style={{ width: 'auto', height: 36, padding: '0 14px', fontSize: 12.5 }}
                onClick={generatePO}
              >
                {t('inv.po')}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mseg" style={{ marginBottom: 16 }}>
          <button
            type="button"
            aria-pressed={tab === 'all'}
            onClick={() => {
              setTab('all')
              setPage(1)
            }}
          >
            {t('inv.tabAll')}
          </button>
          <button
            type="button"
            aria-pressed={tab === 'low'}
            onClick={() => {
              setTab('low')
              setPage(1)
            }}
          >
            {t('inv.tabLow')}
          </button>
          <button
            type="button"
            aria-pressed={tab === 'out'}
            onClick={() => {
              setTab('out')
              setPage(1)
            }}
          >
            {t('inv.tabOut')}
          </button>
        </div>

        <div className="m-sec">{t('inv.stockLevels')}</div>
        <div className="mlist">
          {isPending && items.length === 0 ? (
            <div className="mrow" style={{ cursor: 'default' }}>
              <div className="mt">
                <div className="sub">{t('inv.loading')}</div>
              </div>
            </div>
          ) : null}
          {!isPending && items.length === 0 ? (
            <div className="mrow" style={{ cursor: 'default' }}>
              <div className="mt">
                <div className="sub">{t('inv.empty')}</div>
              </div>
            </div>
          ) : null}
          {items.map((it) => {
            const crit = it.stockStatus === 'out' || it.stockStatus === 'low'
            return (
              <div
                key={it.productId}
                className="mrow"
                style={{ alignItems: 'flex-start' }}
                onClick={() => open(it.productId)}
              >
                <div className="th">
                  {it.imageUrl ? (
                    <img src={it.imageUrl} alt="" />
                  ) : (
                    it.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="mt">
                  <div className="nm">{it.name}</div>
                  <div className="sub">
                    {it.categoryName ?? '—'} ·{' '}
                    {t('inv.reorderAt').replace(
                      '{n}',
                      String(it.reorderPoint ?? it.lowStockThreshold ?? 0),
                    )}
                  </div>
                  <div className="mbar" style={{ marginTop: 8, width: 140 }}>
                    <i
                      className={
                        it.stockStatus === 'out' ? 'out' : it.stockStatus === 'low' ? 'low' : ''
                      }
                      style={{ width: `${fillPct(it)}%` }}
                    />
                  </div>
                </div>
                <div className="rt">
                  <div
                    className="v"
                    style={{
                      color:
                        it.stockStatus === 'out'
                          ? 'var(--danger)'
                          : it.stockStatus === 'low'
                            ? 'var(--warning)'
                            : 'var(--text)',
                    }}
                  >
                    {it.currentStock}
                  </div>
                  {crit ? (
                    <button
                      type="button"
                      className="mbtn mbtn-primary"
                      style={{
                        width: 'auto',
                        height: 30,
                        padding: '0 12px',
                        fontSize: 11.5,
                        marginTop: 6,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate('/inventory/restock')
                      }}
                    >
                      {t('recv.stockTitle')}
                    </button>
                  ) : (
                    <div className="s">{t('inv.onHand')}</div>
                  )}
                </div>
              </div>
            )
          })}
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
      </>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('nav.inventory')}</h1>
          <p>{t('inv.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/inventory/restock')}>
          {t('recv.stockTitle')}
        </Button>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">{t('inv.kStockValue')}</div>
          <div className="v">{stats ? money.compact(stats.stockValueCost) : '—'}</div>
          <div className="h">
            {t('inv.kAcrossSkus').replace('{n}', String(stats?.trackedSkus ?? 0))}
          </div>
        </div>
        <div className="m">
          <div className="k">{t('inv.kUnits')}</div>
          <div className="v">{stats ? stats.unitsOnHand.toLocaleString() : '—'}</div>
          <div className="h">{t('inv.kOnHand')}</div>
        </div>
        <div className="m">
          <div className="k">
            {t('inv.kLow')}{' '}
            {stats && stats.lowStock > 0 ? (
              <span className="badge b-warn">{stats.lowStock}</span>
            ) : null}
          </div>
          <div className="v">{stats?.lowStock ?? 0}</div>
          <div className="h">{t('inv.kBelowReorder')}</div>
        </div>
        <div className="m">
          <div className="k">
            {t('inv.kOut')}{' '}
            {stats && stats.outOfStock > 0 ? (
              <span className="badge b-down">{stats.outOfStock}</span>
            ) : null}
          </div>
          <div className="v">{stats?.outOfStock ?? 0}</div>
          <div className="h">{t('inv.kLostSales')}</div>
        </div>
      </div>

      {attention > 0 ? (
        <div
          className="card"
          style={{
            borderColor: 'var(--warning)',
            background: 'var(--warning-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 18,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--warning)' }}>
              {t('inv.bannerTitle').replace('{n}', String(attention))}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
              {estRestockCost > 0
                ? t('inv.bannerSub').replace('{cost}', money.compact(estRestockCost))
                : t('inv.bannerSubReview')}
            </div>
          </div>
          {suggestions.length > 0 ? (
            <button type="button" className="btn btn-primary" onClick={generatePO}>
              {t('inv.bannerAction')}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--surface)' }}
              onClick={() => {
                setTab('low')
                setPage(1)
              }}
            >
              {t('inv.bannerReview')}
            </button>
          )}
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
        toolbar={
          <>
            <div className="field" style={{ width: 220 }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="9" cy="9" r="6" />
                <path d="m14 14 3 3" />
              </svg>
              <Input
                className="ic"
                placeholder={t('inv.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ height: 36 }}
              />
            </div>
            <Select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                setPage(1)
              }}
              style={{ height: 36, maxWidth: 180 }}
            >
              <option value="">{t('inv.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </>
        }
        pagination={{
          page,
          limit,
          total,
          totalPages,
          onPage: setPage,
          prevLabel: t('common.prev'),
          nextLabel: t('common.next'),
        }}
      />
    </div>
  )
}
