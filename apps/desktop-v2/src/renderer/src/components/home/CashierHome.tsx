import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import {
  Card,
  Hero,
  initialsOf,
  Kpi,
  ListRow,
  RecentSales,
  SectionLabel,
  rangeFor,
} from './home-kit'
import { useReorder, useRecentSales, useSalesSummary } from './use-home-data'

const QI = {
  cart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
      <path d="M8 8h8M8 12h8" />
    </svg>
  ),
}

export function CashierHome() {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const range = useMemo(() => rangeFor('today'), [])

  const sales = useSalesSummary(range)
  const recent = useRecentSales(range, 8)
  const reorder = useReorder()

  const s = sales.data
  const reorderRows = reorder.data ?? []

  return (
    <div className="frame dash">
      <Hero roleKey="cashier" />

      <SectionLabel>{t('home.secActions')}</SectionLabel>
      <div className="qacts mb20">
        <button type="button" className="qact primary" onClick={() => navigate('/sell')}>
          <span className="qi">{QI.cart}</span>
          <div>
            <div className="qt">{t('home.qaNewSale')}</div>
            <div className="qd">{t('home.qaNewSaleD')}</div>
          </div>
        </button>
        <button type="button" className="qact" onClick={() => navigate('/contacts')}>
          <span className="qi">{QI.wallet}</span>
          <div>
            <div className="qt">{t('home.qaPayment')}</div>
            <div className="qd">{t('home.qaPaymentD')}</div>
          </div>
        </button>
        <button type="button" className="qact" onClick={() => navigate('/inventory/restock')}>
          <span className="qi">{QI.box}</span>
          <div>
            <div className="qt">{t('home.qaRestock')}</div>
            <div className="qd">{t('home.qaRestockD')}</div>
          </div>
        </button>
        <button type="button" className="qact" onClick={() => navigate('/expenses')}>
          <span className="qi">{QI.receipt}</span>
          <div>
            <div className="qt">{t('home.qaExpense')}</div>
            <div className="qd">{t('home.qaExpenseD')}</div>
          </div>
        </button>
      </div>

      <SectionLabel>{t('home.secOps')}</SectionLabel>
      <div className="grid4 mb20">
        <Kpi label={t('home.kSales')} value={money.compact(s?.revenue ?? 0)} hint={t('home.hSales').replace('{n}', String(s?.transactions ?? 0))} />
        <Kpi label={t('home.kTransactions')} value={money.plain(s?.transactions ?? 0)} />
        <Kpi label={t('home.kAvgBasket')} value={money.compact(s?.averageBasket ?? 0)} />
        <Kpi label={t('home.kItemsSold')} value={money.plain(s?.itemsSold ?? 0)} />
      </div>

      <div className="split mb20" style={{ alignItems: 'stretch' }}>
        <RecentSales rows={recent.data?.data ?? []} loading={recent.isPending} onViewAll={() => navigate('/sales')} />
        <Card
          title={t('home.cReorder')}
          sub={t('home.cReorderSub')}
          action={
            <button type="button" className="link" onClick={() => navigate('/inventory')}>
              {t('home.viewAll')}
            </button>
          }
        >
          {reorderRows.slice(0, 5).map((r) => (
            <ListRow
              key={r.productId}
              tone="warn"
              initials={initialsOf(r.name)}
              title={r.name}
              meta={
                <span style={{ color: r.currentStock <= 0 ? 'var(--danger)' : 'var(--warning)' }}>
                  {r.currentStock <= 0 ? t('home.outLabel') : t('home.unitsLeft').replace('{n}', String(r.currentStock))}
                </span>
              }
            />
          ))}
          {!reorder.isPending && reorderRows.length === 0 ? <div className="card-empty">{t('home.noLowStock')}</div> : null}
        </Card>
      </div>
    </div>
  )
}
