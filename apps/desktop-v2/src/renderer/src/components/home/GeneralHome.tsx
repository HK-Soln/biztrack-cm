import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import {
  Bars,
  Card,
  Hero,
  initialsOf,
  Kpi,
  ListRow,
  MiniKpi,
  ProgressRow,
  RecentSales,
  SectionLabel,
  compactNum,
  rangeFor,
  usePeriodParam,
  type Period,
} from './home-kit'
import {
  useContactsSummary,
  useExpenseSummary,
  useExpenseTrend,
  useProductStats,
  useReorder,
  useRecentSales,
  useSalesSummary,
} from './use-home-data'

const PERIODS: Period[] = ['today', 'week', 'month', 'year']

export function GeneralHome() {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const [period, setPeriod] = usePeriodParam('today', PERIODS)
  const range = useMemo(() => rangeFor(period), [period])

  const sales = useSalesSummary(range)
  const expenses = useExpenseSummary(range)
  const contacts = useContactsSummary()
  const products = useProductStats()
  const trend = useExpenseTrend()
  const reorder = useReorder()
  const recent = useRecentSales(range)

  const s = sales.data
  const e = expenses.data
  const c = contacts.data
  const p = products.data
  const revenue = s?.revenue ?? 0
  const spend = e?.total ?? 0
  const trendItems = (trend.data ?? []).map((m) => ({ label: m.label, value: m.total }))
  const reorderRows = reorder.data ?? []
  const cn = (n: number) => compactNum(n, money.plain)

  return (
    <div className="frame dash">
      <Hero roleKey="general" period={period} setPeriod={setPeriod} periods={PERIODS} />

      <SectionLabel>{t('home.secPerformance')}</SectionLabel>
      <div className="grid4 mb20">
        <Kpi label={t('home.kRevenue')} value={money.compact(revenue)} hint={t('home.hSales').replace('{n}', String(s?.transactions ?? 0))} />
        <Kpi label={t('home.kTransactions')} value={money.plain(s?.transactions ?? 0)} hint={t('home.hItems').replace('{n}', String(s?.transactions ?? 0))} />
        <Kpi label={t('home.kAvgBasket')} value={money.compact(s?.averageBasket ?? 0)} />
        <Kpi label={t('home.kItemsSold')} value={money.plain(s?.itemsSold ?? 0)} />
      </div>

      <div className="grid4 mb20">
        <MiniKpi
          label={t('home.kExpenses')}
          value={money.compact(spend)}
          badge={e && e.changePct !== 0 ? { text: `${e.changePct > 0 ? '▲' : '▼'} ${Math.abs(e.changePct).toFixed(1)}%`, tone: e.changePct > 0 ? 'down' : 'up' } : null}
        />
        <MiniKpi label={t('home.kReceivable')} value={money.compact(c?.totalReceivable ?? 0)} hint={t('home.hDebtors').replace('{n}', String(c?.debtorCount ?? 0))} />
        <MiniKpi label={t('home.kPayable')} value={money.compact(c?.totalPayable ?? 0)} hint={t('home.hSuppliers').replace('{n}', String(c?.creditorCount ?? 0))} />
        <MiniKpi label={t('home.kProducts')} value={money.plain(p?.totalSkus ?? 0)} hint={t('home.hSkus').replace('{n}', String(p?.totalSkus ?? 0))} />
      </div>

      <div className="split mb20" style={{ alignItems: 'stretch' }}>
        <Card title={t('home.cExpTrend')} sub={t('home.cExpTrendSub')}>
          {trendItems.length ? <Bars items={trendItems} /> : <div className="card-empty">{t('home.noData')}</div>}
        </Card>
        <Card title={t('home.cExpMix')} sub={t('home.cExpMixSub')}>
          {(e?.byCategory ?? []).slice(0, 5).map((cat) => (
            <ProgressRow key={cat.categoryId} name={cat.name} pct={cat.percentage} color={cat.color} amount={money.format(cat.amount)} />
          ))}
          {(e?.byCategory ?? []).length === 0 ? <div className="card-empty">{t('home.noData')}</div> : null}
        </Card>
      </div>

      <SectionLabel>{t('home.secAttention')}</SectionLabel>
      <div className="grid3 mb20">
        <Card
          title={t('home.cReorder')}
          sub={t('home.cReorderSub')}
          action={
            <button type="button" className="link" onClick={() => navigate('/inventory')}>
              {t('home.viewAll')}
            </button>
          }
        >
          {reorderRows.slice(0, 4).map((r) => (
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
              right={<span className="meta">{t('home.threshold')}: {money.plain(r.target)}</span>}
            />
          ))}
          {!reorder.isPending && reorderRows.length === 0 ? <div className="card-empty">{t('home.noLowStock')}</div> : null}
        </Card>

        <Card
          title={t('home.cInventory')}
          sub={t('home.cInventorySub')}
          action={
            <button type="button" className="link" onClick={() => navigate('/inventory')}>
              {t('home.viewAll')}
            </button>
          }
        >
          <div className="pnl" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
            <div className="row"><span>{t('home.iTracked')}</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{money.plain(products.data ? products.data.totalSkus : 0)}</span></div>
            <div className="row"><span>{t('home.iValue')}</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{money.format(products.data?.catalogValueCost ?? 0)}</span></div>
            <div className="row"><span>{t('home.iLow')}</span><span style={{ color: 'var(--warning)', fontWeight: 600 }}>{money.plain(products.data?.lowStock ?? 0)}</span></div>
            <div className="row total"><span>{t('home.iOut')}</span><span style={{ color: 'var(--danger)' }}>{money.plain(products.data?.outOfStock ?? 0)}</span></div>
          </div>
        </Card>

        <Card
          title={t('home.cCredit')}
          sub={t('home.cCreditSub')}
          action={
            <button type="button" className="link" onClick={() => navigate('/contacts')}>
              {t('home.viewAll')}
            </button>
          }
        >
          <div className="pnl" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
            <div className="row"><span>{t('home.pReceivable')}</span><span style={{ color: 'var(--success)', fontWeight: 600 }}>{money.format(c?.totalReceivable ?? 0)}</span></div>
            <div className="row"><span>{t('home.pPayable')}</span><span style={{ color: 'var(--danger)', fontWeight: 600 }}>−{money.format(c?.totalPayable ?? 0)}</span></div>
            <div className="row total"><span>{t('home.pNetWorking')}</span><span>{money.format((c?.totalReceivable ?? 0) - (c?.totalPayable ?? 0))}</span></div>
          </div>
          <div className="grid2" style={{ marginTop: 14 }}>
            <div className="well"><div className="k">{t('home.kReceivable')}</div><div className="v">{cn(c?.totalReceivable ?? 0)}</div></div>
            <div className="well"><div className="k">{t('home.kPayable')}</div><div className="v">{cn(c?.totalPayable ?? 0)}</div></div>
          </div>
        </Card>
      </div>

      <RecentSales rows={recent.data?.data ?? []} loading={recent.isPending} onViewAll={() => navigate('/sales')} />
    </div>
  )
}
