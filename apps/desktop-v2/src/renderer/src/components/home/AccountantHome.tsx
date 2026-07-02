import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import {
  Bars,
  Card,
  fmtTime,
  Hero,
  initialsOf,
  Kpi,
  ListRow,
  ProgressRow,
  RecentSales,
  SectionLabel,
  rangeFor,
  usePeriodParam,
  type Period,
} from './home-kit'
import {
  useContactsSummary,
  useExpenseSummary,
  useExpenseTrend,
  usePendingExpenses,
  useRecentSales,
  useSalesSummary,
} from './use-home-data'

const PERIODS: Period[] = ['month', 'quarter', 'year']

export function AccountantHome() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()
  const [period, setPeriod] = usePeriodParam('month', PERIODS)
  const range = useMemo(() => rangeFor(period), [period])

  const sales = useSalesSummary(range)
  const expenses = useExpenseSummary(range)
  const contacts = useContactsSummary()
  const trend = useExpenseTrend()
  const pending = usePendingExpenses(range)
  const recent = useRecentSales(range)

  const s = sales.data
  const e = expenses.data
  const c = contacts.data
  const revenue = s?.revenue ?? 0
  const spend = e?.total ?? 0
  const operating = revenue - spend
  const trendItems = (trend.data ?? []).map((m) => ({ label: m.label, value: m.total }))
  const pendingRows = pending.data?.data ?? []

  return (
    <div className="frame dash">
      <Hero roleKey="accountant" period={period} setPeriod={setPeriod} periods={PERIODS} />

      <SectionLabel>{t('home.secFinance')}</SectionLabel>
      <div className="grid4 mb20">
        <Kpi label={t('home.kRevenue')} value={money.compact(revenue)} hint={t('home.hSales').replace('{n}', String(s?.transactions ?? 0))} />
        <Kpi
          label={t('home.kExpenses')}
          value={money.compact(spend)}
          badge={e && e.changePct !== 0 ? { text: `${e.changePct > 0 ? '▲' : '▼'} ${Math.abs(e.changePct).toFixed(1)}%`, tone: e.changePct > 0 ? 'down' : 'up' } : null}
        />
        <Kpi label={t('home.kOperating')} value={money.compact(operating)} />
        <Kpi label={t('home.kReceivable')} value={money.compact(c?.totalReceivable ?? 0)} hint={t('home.hDebtors').replace('{n}', String(c?.debtorCount ?? 0))} />
      </div>

      <div className="split mb20" style={{ alignItems: 'stretch' }}>
        <Card
          title={t('home.cPnl')}
          sub={t('home.cPnlSub')}
          action={
            <button type="button" className="link" onClick={() => navigate('/reports')}>
              {t('home.reports')}
            </button>
          }
        >
          <div className="pnl" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
            <div className="row"><span>{t('home.pRevenue')}</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{money.format(revenue)}</span></div>
            <div className="row"><span>{t('home.pExpenses')}</span><span style={{ color: 'var(--danger)', fontWeight: 600 }}>−{money.format(spend)}</span></div>
            <div className="row total"><span>{t('home.pOperating')}</span><span style={{ color: operating < 0 ? 'var(--danger)' : undefined }}>{money.format(operating)}</span></div>
          </div>
          <div className="pnl">
            <div className="row"><span>{t('home.pReceivable')}</span><span style={{ color: 'var(--success)', fontWeight: 600 }}>{money.format(c?.totalReceivable ?? 0)}</span></div>
            <div className="row"><span>{t('home.pPayable')}</span><span style={{ color: 'var(--danger)', fontWeight: 600 }}>−{money.format(c?.totalPayable ?? 0)}</span></div>
            <div className="row total"><span>{t('home.pNetWorking')}</span><span>{money.format((c?.totalReceivable ?? 0) - (c?.totalPayable ?? 0))}</span></div>
          </div>
        </Card>

        <Card
          title={t('home.cExpMix')}
          sub={t('home.cExpMixSub')}
          action={
            <button type="button" className="link" onClick={() => navigate('/expenses')}>
              {t('home.viewAll')}
            </button>
          }
        >
          {(e?.byCategory ?? []).slice(0, 6).map((cat) => (
            <ProgressRow key={cat.categoryId} name={cat.name} pct={cat.percentage} color={cat.color} amount={money.format(cat.amount)} />
          ))}
          {(e?.byCategory ?? []).length === 0 ? <div className="card-empty">{t('home.noData')}</div> : null}
        </Card>
      </div>

      <SectionLabel>{t('home.secAction')}</SectionLabel>
      <div className="split mb20" style={{ alignItems: 'stretch' }}>
        <Card title={t('home.cExpTrend')} sub={t('home.cExpTrendSub')}>
          {trendItems.length ? <Bars items={trendItems} /> : <div className="card-empty">{t('home.noData')}</div>}
        </Card>
        <Card
          title={t('home.cApprovals')}
          sub={t('home.cApprovalsSub')}
          action={
            e && e.pendingCount > 0 ? <span className="badge b-warn">{e.pendingCount}</span> : null
          }
        >
          {pendingRows.map((x) => (
            <ListRow
              key={x.id}
              tone="warn"
              initials={initialsOf(x.categoryName ?? x.description)}
              title={x.description}
              meta={`${x.vendor ? `${x.vendor} · ` : ''}${fmtTime(x.createdAt, lang)}`}
              right={<span className="amt-neg">−{money.format(x.amount)}</span>}
            />
          ))}
          {!pending.isPending && pendingRows.length === 0 ? <div className="card-empty">{t('home.noPending')}</div> : null}
        </Card>
      </div>

      <RecentSales rows={recent.data?.data ?? []} loading={recent.isPending} onViewAll={() => navigate('/sales')} />
    </div>
  )
}
