import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { compactNum, fmtTime, initialsOf, rangeFor } from '../home-kit'
import { useContactsSummary, useExpenseSummary, usePendingExpenses, useSalesSummary } from '../use-home-data'
import { Balance, MHero, MKpiGrid, MList, MRow, MSec } from './mobile-kit'

export function AccountantHomeMobile() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()
  const range = useMemo(() => rangeFor('month'), [])
  const cn = (n: number) => compactNum(n, money.plain)

  const sales = useSalesSummary(range)
  const expenses = useExpenseSummary(range)
  const contacts = useContactsSummary()
  const pending = usePendingExpenses(range)

  const revenue = sales.data?.revenue ?? 0
  const e = expenses.data
  const spend = e?.total ?? 0
  const netProfit = revenue - spend
  const operating = netProfit
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  const c = contacts.data
  const pendingRows = pending.data?.data ?? []

  return (
    <>
      <MHero eyebrow={t('home.roleAccountant')} />

      <Balance
        label={`${t('home.mNetProfit')} · ${t('home.month')}`}
        amount={<>{money.plain(netProfit)} <small>{money.symbol}</small></>}
        delta={{ text: `${margin.toFixed(1)}% ${t('home.mMargin')}` }}
        metrics={[
          { k: t('home.kRevenue'), v: cn(revenue) },
          { k: t('home.kExpenses'), v: cn(spend) },
          { k: t('home.kOperating'), v: cn(operating) },
        ]}
      />

      <MKpiGrid
        items={[
          { icon: 'wallet', tone: 'w', delta: e && e.pendingCount > 0 ? { text: t('home.mPending').replace('{n}', String(e.pendingCount)), dir: 'down' } : null, value: cn(e?.pendingAmount ?? 0), label: t('home.mToApprove') },
          { icon: 'coin', tone: 'g', delta: { text: t('home.hDebtors').replace('{n}', String(c?.debtorCount ?? 0)), dir: 'up' }, value: cn(c?.totalReceivable ?? 0), label: t('home.kReceivable') },
          { icon: 'coin', tone: 'r', delta: { text: t('home.hSuppliers').replace('{n}', String(c?.creditorCount ?? 0)), dir: 'down' }, value: cn(c?.totalPayable ?? 0), label: t('home.kPayable') },
          { icon: 'chart', tone: 'b', value: cn(spend), label: t('home.kExpenses') },
        ]}
      />

      <MSec action={{ label: t('home.mSeeAll'), onPress: () => navigate('/expenses') }}>{t('home.mToApproveList')}</MSec>
      <MList>
        {pendingRows.map((x) => (
          <MRow
            key={x.id}
            initials={initialsOf(x.categoryName ?? x.description)}
            title={x.description}
            sub={`${x.vendor ? `${x.vendor} · ` : ''}${fmtTime(x.createdAt, lang)}`}
            value={<span style={{ color: 'var(--danger)' }}>−{cn(x.amount)}</span>}
          />
        ))}
        {!pending.isPending && pendingRows.length === 0 ? <MRow initials="—" title={t('home.noPending')} /> : null}
      </MList>
    </>
  )
}
