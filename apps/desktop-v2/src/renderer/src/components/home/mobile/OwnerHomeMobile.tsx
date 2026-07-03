import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { compactNum, initialsOf, rangeFor } from '../home-kit'
import {
  useCashierRoster,
  useContactsSummary,
  useExpenseSummary,
  useGrossProfit,
  useSalesByProduct,
  useSalesSummary,
} from '../use-home-data'
import { Balance, MHero, MKpiGrid, MList, MRow, MSec } from './mobile-kit'

export function OwnerHomeMobile() {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const range = useMemo(() => rangeFor('month'), [])
  const cn = (n: number) => compactNum(n, money.plain)

  const sales = useSalesSummary(range)
  const expenses = useExpenseSummary(range)
  const contacts = useContactsSummary()
  const gross = useGrossProfit(range)
  const roster = useCashierRoster(range)
  const products = useSalesByProduct(range)

  const revenue = sales.data?.revenue ?? 0
  const spend = expenses.data?.total ?? 0
  const netProfit = revenue - spend
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  const g = gross.data
  const grossMargin = g && g.revenue > 0 ? ((g.revenue - g.cogs) / g.revenue) * 100 : 0
  const c = contacts.data

  const team = (roster.data ?? []).slice(0, 4)
  const topTeam = team[0]?.sales ?? 0
  const top = (products.data ?? [])
    .map((p) => ({ ...p, profit: p.revenue - p.cogs, marginPct: p.revenue > 0 ? ((p.revenue - p.cogs) / p.revenue) * 100 : 0 }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 3)

  return (
    <>
      <MHero eyebrow={t('home.roleOwner')} />

      <Balance
        label={`${t('home.mNetProfit')} · ${t('home.month')}`}
        amount={<>{money.plain(netProfit)} <small>{money.symbol}</small></>}
        delta={{ text: `${margin.toFixed(1)}% ${t('home.mMargin')}` }}
        metrics={[
          { k: t('home.kRevenue'), v: cn(revenue) },
          { k: t('home.kExpenses'), v: cn(spend) },
          { k: t('home.kReceivable'), v: cn(c?.totalReceivable ?? 0) },
        ]}
      />

      <MKpiGrid
        items={[
          { icon: 'coin', tone: 'g', delta: { text: t('home.hDebtors').replace('{n}', String(c?.debtorCount ?? 0)), dir: 'up' }, value: cn(c?.totalReceivable ?? 0), label: t('home.kReceivable') },
          { icon: 'coin', tone: 'r', delta: { text: t('home.hSuppliers').replace('{n}', String(c?.creditorCount ?? 0)), dir: 'down' }, value: cn(c?.totalPayable ?? 0), label: t('home.kPayable') },
          { icon: 'chart', tone: 'b', value: `${grossMargin.toFixed(1)}%`, label: t('home.mGrossMargin') },
          {
            icon: 'wallet',
            tone: 'w',
            delta: expenses.data && expenses.data.changePct !== 0 ? { text: `${expenses.data.changePct > 0 ? '▲' : '▼'} ${Math.abs(expenses.data.changePct).toFixed(1)}%`, dir: expenses.data.changePct > 0 ? 'down' : 'up' } : null,
            value: cn(spend),
            label: t('home.kExpenses'),
          },
        ]}
      />

      <MSec action={{ label: t('home.mSeeAll'), onPress: () => navigate('/sales') }}>{t('home.mTeam')}</MSec>
      <MList>
        {team.map((m) => (
          <MRow
            key={m.cashierId}
            initials={initialsOf(m.name)}
            title={m.name}
            sub={t('home.mSalesCount').replace('{n}', String(m.transactions))}
            value={cn(m.sales)}
            right={`${topTeam > 0 ? Math.round((m.sales / topTeam) * 100) : 0}%`}
          />
        ))}
        {!roster.isPending && team.length === 0 ? <MRow initials="—" title={t('home.mNoRows')} /> : null}
      </MList>

      <MSec action={{ label: t('home.mSeeAll'), onPress: () => navigate('/products') }}>{t('home.mTopProducts')}</MSec>
      <MList>
        {top.map((p) => (
          <MRow
            key={p.productId}
            initials={initialsOf(p.name)}
            title={p.name}
            sub={t('home.mSoldMargin').replace('{n}', String(p.quantity)).replace('{p}', p.marginPct.toFixed(0))}
            value={cn(p.profit)}
            right={t('home.mProfit')}
          />
        ))}
        {!products.isPending && top.length === 0 ? <MRow initials="—" title={t('home.mNoRows')} /> : null}
      </MList>
    </>
  )
}
