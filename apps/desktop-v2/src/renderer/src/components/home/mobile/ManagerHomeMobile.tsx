import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { compactNum, initialsOf, rangeFor } from '../home-kit'
import { useCashierRoster, useReorder, useSalesSummary } from '../use-home-data'
import { Balance, MAlert, MHero, MList, MRow, MSec, QuickActions } from './mobile-kit'

export function ManagerHomeMobile() {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const range = useMemo(() => rangeFor('today'), [])
  const cn = (n: number) => compactNum(n, money.plain)

  const sales = useSalesSummary(range)
  const roster = useCashierRoster(range)
  const reorder = useReorder()

  const s = sales.data
  const staff = (roster.data ?? []).filter((r) => r.transactions > 0).slice(0, 5)
  const reorderRows = reorder.data ?? []

  return (
    <>
      <MHero eyebrow={t('home.roleManager')} />

      <Balance
        label={t('home.mSalesToday')}
        amount={<>{money.plain(s?.revenue ?? 0)} <small>{money.symbol}</small></>}
        metrics={[
          { k: t('home.kTransactions'), v: money.plain(s?.transactions ?? 0) },
          { k: t('home.kAvgBasket'), v: cn(s?.averageBasket ?? 0) },
          { k: t('home.kItemsSold'), v: money.plain(s?.itemsSold ?? 0) },
        ]}
      />

      <QuickActions
        items={[
          { icon: 'plus', label: t('home.qaNewSale'), tone: 'brand', onPress: () => navigate('/sell') },
          { icon: 'download', label: t('home.mReorder'), tone: 'w', onPress: () => navigate('/inventory') },
          { icon: 'check', label: t('home.mApprove'), tone: 'g', onPress: () => navigate('/expenses') },
          { icon: 'clipboard', label: t('home.mStockTake'), tone: 'brand', onPress: () => navigate('/inventory') },
        ]}
      />

      <MSec>{t('home.mStaff')}</MSec>
      <MList>
        {staff.map((m) => (
          <MRow
            key={m.cashierId}
            initials={initialsOf(m.name)}
            title={m.name}
            sub={t('home.mSalesCount').replace('{n}', String(m.transactions))}
            value={cn(m.sales)}
          />
        ))}
        {!roster.isPending && staff.length === 0 ? <MRow initials="—" title={t('home.mNoRows')} /> : null}
      </MList>

      {reorderRows.length > 0 ? (
        <MAlert
          title={t('home.mReorderAlert').replace('{n}', String(reorderRows.length))}
          sub={t('home.mReorderAlertSub')}
          onPress={() => navigate('/inventory')}
        />
      ) : null}
    </>
  )
}
