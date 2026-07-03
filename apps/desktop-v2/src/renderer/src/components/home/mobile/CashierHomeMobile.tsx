import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { useSessionStore } from '@/stores/session.store'
import { compactNum, fmtTime, initialsOf, payLabel, rangeFor } from '../home-kit'
import { useCashierRoster, useRecentSales, useSalesSummary } from '../use-home-data'
import { Balance, MHero, MIcon, MList, MPill, MRow, MSec, QuickActions, salePill } from './mobile-kit'

export function CashierHomeMobile() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()
  const userId = useSessionStore((s) => s.status.user?.id)
  const range = useMemo(() => rangeFor('today'), [])
  const cn = (n: number) => compactNum(n, money.plain)

  const summary = useSalesSummary(range)
  const roster = useCashierRoster(range)
  const recent = useRecentSales(range)

  const mine = (roster.data ?? []).find((r) => r.cashierId === userId)
  const mySales = mine ? mine.sales : summary.data?.revenue ?? 0
  const myTx = mine ? mine.transactions : summary.data?.transactions ?? 0
  const avgBasket = myTx > 0 ? Math.round(mySales / myTx) : 0
  const rows = recent.data?.data ?? []

  return (
    <>
      <MHero eyebrow={t('home.mOnShift')} />

      <button type="button" className="m-cta" style={{ marginBottom: 16 }} onClick={() => navigate('/sell')}>
        <MIcon name="cart" />
        {t('home.mStartSale')}
      </button>

      <Balance
        label={t('home.mMySales')}
        amount={<>{money.plain(mySales)} <small>{money.symbol}</small></>}
        metrics={[
          { k: t('home.kTransactions'), v: money.plain(myTx) },
          { k: t('home.kAvgBasket'), v: cn(avgBasket) },
          { k: t('home.kItemsSold'), v: money.plain(summary.data?.itemsSold ?? 0) },
        ]}
      />

      <QuickActions
        items={[
          { icon: 'card', label: t('home.mPayment'), tone: 'g', onPress: () => navigate('/contacts') },
          { icon: 'wallet', label: t('home.mExpense'), tone: 'r', onPress: () => navigate('/expenses') },
          { icon: 'download', label: t('home.mReorder'), tone: 'w', onPress: () => navigate('/inventory') },
          { icon: 'chart', label: t('nav.sales'), tone: 'brand', onPress: () => navigate('/sales') },
        ]}
      />

      <MSec action={{ label: t('home.mSeeAll'), onPress: () => navigate('/sales') }}>{t('home.mMyRecent')}</MSec>
      <MList>
        {rows.map((sale) => {
          const sp = salePill(sale)
          return (
            <MRow
              key={sale.id}
              initials={initialsOf(sale.customerName ?? t('home.walkIn'))}
              title={`${sale.customerName ?? t('home.walkIn')} · ${sale.saleNumber}`}
              sub={`${payLabel(t, sale.paymentMethod)} · ${fmtTime(sale.soldAt, lang)}`}
              value={money.format(sale.totalAmount)}
              right={<MPill tone={sp.tone}>{t(sp.label)}</MPill>}
              onPress={() => navigate('/sales')}
            />
          )
        })}
        {!recent.isPending && rows.length === 0 ? <MRow initials="—" title={t('home.noSales')} /> : null}
      </MList>
    </>
  )
}
