import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Pagination, Select } from '@biztrack/ui/biztrack'
import { ContactType } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { ContactPaymentModal } from '@/components/ContactPaymentModal'
import type { LocalContact, LocalContactListItem } from '@shared/ipc'

type Tab = 'all' | 'customers' | 'suppliers' | 'debtors' | 'creditors'
const TABS: Tab[] = ['all', 'customers', 'suppliers', 'debtors', 'creditors']
const TAB_FILTER: Record<Tab, Record<string, unknown>> = {
  all: {},
  customers: { type: ContactType.CUSTOMER },
  suppliers: { type: ContactType.SUPPLIER },
  debtors: { balance: 'debtor' },
  creditors: { balance: 'creditor' },
}
type Sort = 'balance' | 'name' | 'recent'
const SORT_QUERY: Record<Sort, Record<string, unknown>> = {
  balance: { sort: 'balance', order: 'desc' },
  name: { sort: 'name', order: 'asc' },
  recent: { sort: 'createdAt', order: 'desc' },
}

export function Contacts() {
  const t = useT()
  const bp = useBreakpoint()
  const qc = useQueryClient()
  const money = useCurrency()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const tab = (TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'all')
  const [sort, setSort] = useState<Sort>('balance')
  const [payContact, setPayContact] = useState<LocalContactListItem | null>(null)

  const { data: summary } = useQuery({
    queryKey: [...queryKeys.contacts, 'summary'],
    queryFn: () => dataClient.contacts.summary(),
    enabled: true,
  })

  const { items, total, page, limit, totalPages, isPending, search, setSearch, setPage } = usePaged<LocalContactListItem>(
    queryKeys.contacts,
    (q) => dataClient.contacts.list(q),
    { enabled: true, extra: { ...TAB_FILTER[tab], ...SORT_QUERY[sort] } },
  )

  const setTab = (next: Tab) => {
    setPage(1)
    setParams((p) => { const n = new URLSearchParams(p); if (next === 'all') n.delete('tab'); else n.set('tab', next); return n }, { replace: true })
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.contacts })

  const typeBadge = (c: LocalContact) =>
    c.type === ContactType.SUPPLIER ? (
      <span className="st st-low"><span className="d" />{t('ct.supplier')}</span>
    ) : c.type === ContactType.CUSTOMER ? (
      <span className="st st-ok"><span className="d" />{t('ct.customer')}</span>
    ) : (
      <span className="st st-brand"><span className="d" />{t('ct.both')}</span>
    )

  const balanceCell = (c: LocalContactListItem) => {
    if (c.totalReceivable > 0) return <span className="bal r">+{money.format(c.totalReceivable)}</span>
    if (c.totalPayable > 0) return <span className="bal p">−{money.format(c.totalPayable)}</span>
    return <span className="bal z">0</span>
  }
  const hasBalance = (c: LocalContactListItem) => c.totalReceivable > 0 || c.totalPayable > 0
  const actionLabel = (c: LocalContactListItem) =>
    c.totalReceivable > 0 ? t('ct.recordPayment') : c.totalPayable > 0 ? t('ct.paySupplier') : t('ct.view')

  // Oldest-unpaid age → a single coloured bucket (0–30 / 31–60 / 60+). Not a full
  // aging breakdown (we don't store per-bucket amounts) — based on the oldest open debt.
  const agedBar = (c: LocalContactListItem) => {
    if (!hasBalance(c) || !c.oldestUnpaidAt) return <span style={{ color: 'var(--text-muted)' }}>—</span>
    const days = Math.floor((Date.now() - new Date(c.oldestUnpaidAt).getTime()) / 86400000)
    const bucket = days <= 30 ? 'a0' : days <= 60 ? 'a1' : 'a2'
    return (
      <span className="aged" title={t('ct.ageDays').replace('{n}', String(Math.max(0, days)))}>
        <i className={bucket} style={{ width: '100%' }} />
      </span>
    )
  }
  const onAction = (c: LocalContactListItem) => (hasBalance(c) ? setPayContact(c) : navigate(`/contacts/${c.id}`))

  const tabCount: Record<Tab, number | undefined> = {
    all: summary?.allCount,
    customers: summary?.customerCount,
    suppliers: summary?.supplierCount,
    debtors: summary?.debtorCount,
    creditors: summary?.creditorCount,
  }
  const net = (summary?.totalReceivable ?? 0) - (summary?.totalPayable ?? 0)

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('ct.title')}</h1>
          <p>{t('ct.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/contacts/new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
          {t('ct.new')}
        </Button>
      </div>

      <div className="minihead">
        <div className="m"><div className="k">{t('ct.kReceivable')} <span className="badge b-up">{t('ct.kOwedToYou')}</span></div><div className="v" style={{ color: 'var(--success)' }}>{money.format(summary?.totalReceivable ?? 0)}</div><div className="h">{t('ct.kDebtors').replace('{n}', String(summary?.debtorCount ?? 0))}</div></div>
        <div className="m"><div className="k">{t('ct.kPayable')} <span className="badge b-down">{t('ct.kYouOwe')}</span></div><div className="v" style={{ color: 'var(--danger)' }}>{money.format(summary?.totalPayable ?? 0)}</div><div className="h">{t('ct.kCreditors').replace('{n}', String(summary?.creditorCount ?? 0))}</div></div>
        <div className="m"><div className="k">{t('ct.kNet')}</div><div className="v">{net >= 0 ? '+' : '−'}{money.format(Math.abs(net))}</div><div className="h">{t('ct.kNetHint')}</div></div>
        <div className="m"><div className="k">{t('ct.kContacts')}</div><div className="v">{summary?.allCount ?? 0}</div><div className="h">{t('ct.kContactsHint')}</div></div>
      </div>

      <div className="tabs">
        {TABS.map((key) => (
          <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {t(`ct.tab_${key}` as Parameters<typeof t>[0])}
            {tabCount[key] != null ? <span className="cnt">{tabCount[key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="field grow">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>
          <input className="input ic" value={search} placeholder={t('ct.search')} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1) }} style={{ maxWidth: 220 }}>
          <option value="balance">{t('ct.sortBalance')}</option>
          <option value="name">{t('ct.sortName')}</option>
          <option value="recent">{t('ct.sortRecent')}</option>
        </Select>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t(`ct.tab_${tab}` as Parameters<typeof t>[0])}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="chip-tag">{t('ct.countChip').replace('{n}', String(total))}</span>
        </div>

        {isPending ? (
          <div className="cat-empty">{t('ct.loading')}</div>
        ) : items.length === 0 ? (
          <div className="cat-empty">{t('ct.empty')}</div>
        ) : bp === 'mobile' ? (
          <div className="u-cards">
            {items.map((c) => (
              <div key={c.id} className="u-card clickable" onClick={() => navigate(`/contacts/${c.id}`)}>
                <span className="th brand">{c.selfieUrl ? <img src={c.selfieUrl} alt="" /> : c.name.slice(0, 2).toUpperCase()}</span>
                <div className="u-main">
                  <div className="u-nm">{c.name}</div>
                  <div className="u-sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {typeBadge(c)} {c.phone ? <span className="chip-tag">{c.phone}</span> : null}
                  </div>
                </div>
                {balanceCell(c)}
              </div>
            ))}
          </div>
        ) : (
          <table className="ltbl">
            <thead>
              <tr>
                <th>{t('ct.colName')}</th>
                <th>{t('ct.colType')}</th>
                <th>{t('ct.colActivity')}</th>
                <th>{t('ct.colAged')}</th>
                <th className="right">{t('ct.colBalance')}</th>
                <th className="right">{t('ct.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/contacts/${c.id}`)}>
                  <td>
                    <div className="cell">
                      <div className="th brand">{c.selfieUrl ? <img src={c.selfieUrl} alt="" /> : c.name.slice(0, 2).toUpperCase()}</div>
                      <div><div className="nm">{c.name}</div><div className="sub">{c.phone || '—'}</div></div>
                    </div>
                  </td>
                  <td>{typeBadge(c)}</td>
                  <td className="sub" style={{ color: 'var(--text-2)' }}>{new Date(c.updatedAt).toLocaleDateString()}</td>
                  <td>{agedBar(c)}</td>
                  <td className="right">{balanceCell(c)}</td>
                  <td className="right">
                    <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onAction(c) }}>{actionLabel(c)}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPage={setPage} prevLabel={t('common.prev')} nextLabel={t('common.next')} />
      </div>

      {payContact ? (
        <ContactPaymentModal contactId={payContact.id} contactName={payContact.name} onClose={() => setPayContact(null)} onSaved={() => { invalidate(); setPayContact(null) }} />
      ) : null}
    </div>
  )
}
