import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { compactNum, fmtTime, initialsOf, payLabel, rangeFor } from '../home-kit'
import { useContactsSummary, useRecentSales, useReorder, useSalesSummary } from '../use-home-data'
import { Balance, MAlert, MHero, MKpiGrid, MList, MPill, MRow, MSec, QuickActions, salePill } from './mobile-kit'

function greetKey(): 'home.morning' | 'home.afternoon' | 'home.evening' {
  const h = new Date().getHours()
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening'
}

export function GeneralHomeMobile() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()
  const range = useMemo(() => rangeFor('today'), [])
  const cn = (n: number) => compactNum(n, money.plain)

  const sales = useSalesSummary(range)
  const contacts = useContactsSummary()
  const reorder = useReorder()
  const recent = useRecentSales(range)

  const s = sales.data
  const c = contacts.data
  const reorderRows = reorder.data ?? []
  const rows = recent.data?.data ?? []

  return (
    <>
      <MHero eyebrow={t(greetKey())} />

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
          { icon: 'wallet', label: t('home.mExpense'), tone: 'r', onPress: () => navigate('/expenses') },
          { icon: 'card', label: t('home.mPayment'), tone: 'g', onPress: () => navigate('/contacts') },
          { icon: 'download', label: t('home.mReorder'), tone: 'w', onPress: () => navigate('/inventory') },
        ]}
      />

      <MKpiGrid
        items={[
          { icon: 'coin', tone: 'g', delta: { text: t('home.hDebtors').replace('{n}', String(c?.debtorCount ?? 0)), dir: 'up' }, value: cn(c?.totalReceivable ?? 0), label: t('home.kReceivable') },
          { icon: 'coin', tone: 'r', delta: { text: t('home.hSuppliers').replace('{n}', String(c?.creditorCount ?? 0)), dir: 'down' }, value: cn(c?.totalPayable ?? 0), label: t('home.kPayable') },
          { icon: 'warn', tone: 'w', value: money.plain(reorderRows.length), label: t('home.kLowStock') },
          { icon: 'box', tone: 'b', value: money.plain(s?.itemsSold ?? 0), label: t('home.kItemsSold') },
        ]}
      />

      <MSec action={{ label: t('home.mSeeAll'), onPress: () => navigate('/sales') }}>{t('home.mRecent')}</MSec>
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
