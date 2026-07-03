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
import { ContactStatementView } from '@/components/contacts/ContactStatementView'
import { MobileSheet } from '@/components/MobileSheet'
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
  const [openId, setOpenId] = useState<string | null>(null)

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
    setOpenId(null)
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

  // Compact balance for the mobile/tablet list rows: signed value + short caption.
  const balInfo = (c: LocalContactListItem) => {
    if (c.totalReceivable > 0) return { txt: `+${money.compact(c.totalReceivable)}`, color: 'var(--success)', sub: t('ct.theyOwe') }
    if (c.totalPayable > 0) return { txt: `−${money.compact(c.totalPayable)}`, color: 'var(--danger)', sub: t('ct.youOwe') }
    return { txt: '0', color: 'var(--text-muted)', sub: t('ct.settled') }
  }
  const avatarNode = (c: LocalContactListItem) => (c.selfieUrl ? <img src={c.selfieUrl} alt="" /> : c.name.slice(0, 2).toUpperCase())
  const contactTypeLabel = (c: LocalContact) =>
    c.type === ContactType.SUPPLIER ? t('ct.supplier') : c.type === ContactType.BOTH ? t('ct.both') : t('ct.customer')

  const tabCount: Record<Tab, number | undefined> = {
    all: summary?.allCount,
    customers: summary?.customerCount,
    suppliers: summary?.supplierCount,
    debtors: summary?.debtorCount,
    creditors: summary?.creditorCount,
  }
  const net = (summary?.totalReceivable ?? 0) - (summary?.totalPayable ?? 0)
  const headSub = t('ct.mHeadSub')
    .replace('{n}', String(summary?.allCount ?? 0))
    .replace('{b}', String((summary?.debtorCount ?? 0) + (summary?.creditorCount ?? 0)))

  // --- mobile: back header + KPIs + search + filter chips + list + statement sheet ---
  if (bp === 'mobile') {
    return (
      <>
        <header className="m-head">
          <button type="button" className="back" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div className="m-tt">
            <div className="m-title">{t('ct.title')}</div>
            <div className="m-sub">{headSub}</div>
          </div>
        </header>

        <div className="mkpis" style={{ marginBottom: 16 }}>
          <div className="mkpi">
            <div className="top"><span className="d up" style={{ fontSize: 11 }}>{t('ct.kOwedToYou')}</span></div>
            <div className="v" style={{ color: 'var(--success)' }}>{money.compact(summary?.totalReceivable ?? 0)}</div>
            <div className="k">{t('ct.kReceivable')} · {summary?.debtorCount ?? 0}</div>
          </div>
          <div className="mkpi">
            <div className="top"><span className="d down" style={{ fontSize: 11 }}>{t('ct.kYouOwe')}</span></div>
            <div className="v" style={{ color: 'var(--danger)' }}>{money.compact(summary?.totalPayable ?? 0)}</div>
            <div className="k">{t('ct.kPayable')} · {summary?.creditorCount ?? 0}</div>
          </div>
        </div>

        <div className="msearch" style={{ marginBottom: 13 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>
          <input placeholder={t('ct.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="mchips" style={{ marginBottom: 16 }}>
          {TABS.map((key) => (
            <button key={key} type="button" className={`mchip${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              {t(`ct.tab_${key}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>

        <div className="mlist">
          {isPending && items.length === 0 ? <div className="mrow" style={{ cursor: 'default' }}><div className="mt"><div className="sub">{t('ct.loading')}</div></div></div> : null}
          {!isPending && items.length === 0 ? <div className="mrow" style={{ cursor: 'default' }}><div className="mt"><div className="sub">{t('ct.empty')}</div></div></div> : null}
          {items.map((c) => {
            const b = balInfo(c)
            return (
              <button key={c.id} type="button" className="mrow" onClick={() => setOpenId(c.id)}>
                <div className="th brand round">{avatarNode(c)}</div>
                <div className="mt">
                  <div className="nm">{c.name}</div>
                  <div className="sub">{contactTypeLabel(c)}{c.phone ? ` · ${c.phone}` : ''}</div>
                </div>
                <div className="rt">
                  <div className="v" style={{ color: b.color }}>{b.txt}</div>
                  <div className="s">{b.sub}</div>
                </div>
              </button>
            )
          })}
        </div>

        {totalPages > 1 ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button type="button" className="mbtn" style={{ width: 'auto', padding: '0 18px' }} disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.prev')}</button>
            <button type="button" className="mbtn" style={{ width: 'auto', padding: '0 18px' }} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('common.next')}</button>
          </div>
        ) : null}

        <button type="button" className="mfab" onClick={() => navigate('/contacts/new')} aria-label={t('ct.new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
        </button>

        {openId ? (
          <MobileSheet title={t('ct.statement')} onClose={() => setOpenId(null)}>
            <ContactStatementView contactId={openId} />
          </MobileSheet>
        ) : null}
      </>
    )
  }

  // --- tablet: two-pane master-detail (contact list left, statement right) ---
  if (bp === 'tablet') {
    const selectedId = openId ?? items[0]?.id ?? null
    return (
      <div className="tpane">
        <div className="page-head" style={{ marginBottom: 14 }}>
          <div>
            <h1>{t('ct.title')}</h1>
            <p>{headSub}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="field" style={{ width: 200 }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>
              <input className="input ic" value={search} placeholder={t('ct.search')} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="primary" onClick={() => navigate('/contacts/new')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
              {t('ct.new')}
            </Button>
          </div>
        </div>

        <div className="tabs" style={{ flexShrink: 0 }}>
          {TABS.map((key) => (
            <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {t(`ct.tab_${key}` as Parameters<typeof t>[0])}
              {tabCount[key] != null ? <span className="cnt">{tabCount[key]}</span> : null}
            </button>
          ))}
        </div>

        <div className="tsplit">
          <div className="tsplit-list">
            <div className="tslh">
              <span className="chip-tag">{t('ct.countChip').replace('{n}', String(total))}</span>
              <div style={{ flex: 1 }} />
              <Select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); setOpenId(null) }} style={{ height: 34, fontSize: 12, maxWidth: 150 }}>
                <option value="balance">{t('ct.sortBalance')}</option>
                <option value="name">{t('ct.sortName')}</option>
                <option value="recent">{t('ct.sortRecent')}</option>
              </Select>
            </div>
            <div className="tslb">
              {isPending && items.length === 0 ? <div className="cat-empty">{t('ct.loading')}</div> : null}
              {!isPending && items.length === 0 ? <div className="cat-empty">{t('ct.empty')}</div> : null}
              {items.map((c) => {
                const b = balInfo(c)
                return (
                  <button key={c.id} type="button" className={`trow${c.id === selectedId ? ' sel' : ''}`} onClick={() => setOpenId(c.id)}>
                    <div className="th brand round">{avatarNode(c)}</div>
                    <div className="tt">
                      <div className="nm">{c.name}</div>
                      <div className="sub">{contactTypeLabel(c)}{c.phone ? ` · ${c.phone}` : ''}</div>
                    </div>
                    <div className="rt">
                      <div className="v" style={{ color: b.color }}>{b.txt}</div>
                      <div className="s">{b.sub}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="tsplit-detail">
            {selectedId ? <div className="tsdpad"><ContactStatementView contactId={selectedId} /></div> : <div className="receipt-empty">{t('ct.empty')}</div>}
          </div>
        </div>

        {payContact ? (
          <ContactPaymentModal contactId={payContact.id} contactName={payContact.name} onClose={() => setPayContact(null)} onSaved={() => { invalidate(); setPayContact(null) }} />
        ) : null}
      </div>
    )
  }

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
