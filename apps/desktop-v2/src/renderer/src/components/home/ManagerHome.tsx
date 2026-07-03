import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import {
  Card,
  fmtTime,
  Hero,
  initialsOf,
  Kpi,
  ListRow,
  RecentSales,
  SectionLabel,
  rangeFor,
  usePeriodParam,
  type Period,
} from './home-kit'
import {
  useDepositSummary,
  useExpenseSummary,
  usePendingExpenses,
  useReorder,
  useRecentSales,
  useSalesSummary,
} from './use-home-data'

const PERIODS: Period[] = ['today', 'week', 'month']

export function ManagerHome() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()
  const [period, setPeriod] = usePeriodParam('today', PERIODS)
  const range = useMemo(() => rangeFor(period), [period])

  const sales = useSalesSummary(range)
  const expenses = useExpenseSummary(range)
  const deposits = useDepositSummary()
  const reorder = useReorder()
  const pending = usePendingExpenses(range)
  const recent = useRecentSales(range)

  const s = sales.data
  const e = expenses.data
  const d = deposits.data
  const reorderRows = reorder.data ?? []
  const pendingRows = pending.data?.data ?? []

  return (
    <div className="frame dash">
      <Hero roleKey="manager" period={period} setPeriod={setPeriod} periods={PERIODS} />

      <SectionLabel>{t('home.secOps')}</SectionLabel>
      <div className="grid4 mb20">
        <Kpi label={t('home.kSales')} value={money.compact(s?.revenue ?? 0)} hint={t('home.hSales').replace('{n}', String(s?.transactions ?? 0))} />
        <Kpi label={t('home.kAvgBasket')} value={money.compact(s?.averageBasket ?? 0)} />
        <Kpi label={t('home.kItemsSold')} value={money.plain(s?.itemsSold ?? 0)} hint={t('home.hItems').replace('{n}', String(s?.transactions ?? 0))} />
        <Kpi
          label={t('home.kRefunds')}
          value={money.plain(s?.refundCount ?? 0)}
          hint={money.format(s?.refundAmount ?? 0)}
          badge={s && s.refundCount > 0 ? { text: String(s.refundCount), tone: 'warn' } : null}
        />
      </div>

      <SectionLabel>{t('home.secAction')}</SectionLabel>
      <div className="grid3 mb20">
        <Card
          title={t('home.cReorder')}
          sub={t('home.cReorderSub')}
          action={reorderRows.length ? <span className="badge b-warn">{reorderRows.length}</span> : null}
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
              right={
                <button type="button" className="link" onClick={() => navigate('/inventory/restock')}>
                  {t('home.reorder')}
                </button>
              }
            />
          ))}
          {!reorder.isPending && reorderRows.length === 0 ? <div className="card-empty">{t('home.noLowStock')}</div> : null}
        </Card>

        <Card
          title={t('home.cDeposits')}
          sub={t('home.cDepositsSub')}
          action={
            <button type="button" className="link" onClick={() => navigate('/deposits')}>
              {t('home.viewAll')}
            </button>
          }
        >
          <div className="pnl" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
            <div className="row"><span>{t('home.openDeposits')}</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{money.plain(d?.openCount ?? 0)}</span></div>
            <div className="row"><span>{t('home.pDepositsHeld')}</span><span style={{ color: 'var(--success)', fontWeight: 600 }}>{money.format(d?.depositsHeld ?? 0)}</span></div>
            <div className="row total"><span>{t('home.pCollected')}</span><span>{money.format(d?.collectedAmount ?? 0)}</span></div>
          </div>
        </Card>

        <Card
          title={t('home.cApprovals')}
          sub={t('home.cApprovalsSub')}
          action={e && e.pendingCount > 0 ? <span className="badge b-warn">{e.pendingCount}</span> : null}
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
