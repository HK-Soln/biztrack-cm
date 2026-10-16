import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Pagination } from '@biztrack/ui/biztrack'
import type { OnlineCustomer } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useT } from '@/i18n'
import { OnlineError, OnlineUpsell, isPlanUpgrade } from '@/components/online/OnlineStates'
import { AddToContactsButton } from '@/components/online/AddToContactsButton'

/**
 * The people who have ordered from the storefront (ruling R20). They are not contacts: the
 * shop adds the ones worth keeping, through the contact rules.
 */
export function OnlineCustomers() {
  const t = useT()
  const bp = useBreakpoint()
  const money = useCurrency()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const query = useQuery({
    queryKey: ['online', 'customers', page, debounced],
    queryFn: () => dataClient.online.listCustomers({ page, limit: 20, search: debounced }),
    placeholderData: keepPreviousData,
  })
  if (query.error && isPlanUpgrade(query.error)) return <OnlineUpsell />
  if (query.error) return <OnlineError error={query.error} onRetry={() => void query.refetch()} />

  const items = query.data?.data ?? []
  const total = query.data?.total ?? 0
  const day = (iso: string) => new Date(iso).toLocaleDateString()
  const reach = (c: OnlineCustomer) => [c.phone, c.email].filter(Boolean).join(' · ') || '—'

  const searchBox = (
    <div
      className={bp === 'mobile' ? 'msearch' : 'field grow'}
      style={{ marginBottom: bp === 'mobile' ? 13 : 0 }}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="9" cy="9" r="6" />
        <path d="m14 14 3 3" />
      </svg>
      <input
        className={bp === 'mobile' ? undefined : 'input ic'}
        value={search}
        placeholder={t('online.customersSearch')}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
  )
  const empty = query.isPending ? t('ct.loading') : t('online.customersEmpty')

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('online.customersTitle')}</h1>
          <p>{t('online.customersSub')}</p>
        </div>
      </div>

      {bp === 'mobile' ? (
        <>
          {searchBox}
          <div className="mlist">
            {items.length === 0 ? (
              <div className="mrow" style={{ cursor: 'default' }}>
                <div className="mt">
                  <div className="sub">{empty}</div>
                </div>
              </div>
            ) : null}
            {items.map((c) => (
              <div key={c.id} className="mrow" style={{ cursor: 'default' }}>
                <div className="th brand round">{c.name.slice(0, 2).toUpperCase()}</div>
                <div className="mt">
                  <div className="nm">{c.name}</div>
                  <div className="sub">
                    {t('online.customerOrders').replace('{n}', String(c.orderCount))} ·{' '}
                    {money.compact(c.totalSpent)}
                  </div>
                </div>
                <div className="rt">
                  <AddToContactsButton customer={c} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="toolbar">{searchBox}</div>
          <div className="panel">
            <div className="panel-head">
              <h3>{t('online.customersTitle')}</h3>
              <div className="spacer" style={{ flex: 1 }} />
              <span className="chip-tag">{t('ct.countChip').replace('{n}', String(total))}</span>
            </div>
            {items.length === 0 ? (
              <div className="cat-empty">{empty}</div>
            ) : (
              <table className="ltbl">
                <thead>
                  <tr>
                    <th>{t('ct.colName')}</th>
                    <th className="right">{t('online.colOrders')}</th>
                    <th className="right">{t('online.colSpent')}</th>
                    <th>{t('online.colLastOrder')}</th>
                    <th className="right">{t('online.colContact')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="cell">
                          <div className="th brand">{c.name.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <div className="nm">{c.name}</div>
                            <div className="sub">{reach(c)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="right">{c.orderCount}</td>
                      <td className="right">{money.format(c.totalSpent)}</td>
                      <td className="sub" style={{ color: 'var(--text-2)' }}>
                        {day(c.lastOrderAt)}
                      </td>
                      <td className="right">
                        {c.contactName ? (
                          <div className="sub" style={{ marginBottom: 4 }}>
                            {c.contactName}
                          </div>
                        ) : null}
                        <AddToContactsButton customer={c} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Pagination
              page={query.data?.page ?? page}
              totalPages={query.data?.totalPages ?? 1}
              total={total}
              limit={query.data?.limit ?? 20}
              onPage={setPage}
              prevLabel={t('common.prev')}
              nextLabel={t('common.next')}
            />
          </div>
        </>
      )}
      {bp === 'mobile' && (query.data?.totalPages ?? 1) > 1 ? (
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
            disabled={page >= (query.data?.totalPages ?? 1)}
            onClick={() => setPage(page + 1)}
          >
            {t('common.next')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
