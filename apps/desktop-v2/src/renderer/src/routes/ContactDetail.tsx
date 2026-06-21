import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BackButton, Button, Modal } from '@biztrack/ui/biztrack'
import { ContactStatementEntryType, ContactType, DebtDirection } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { ActionMenu } from '@/components/ActionMenu'
import { ContactPaymentModal } from '@/components/ContactPaymentModal'
import type { ContactStatement, ContactStatementEntry } from '@shared/ipc'

const STMT_SPLIT = { display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 14, alignItems: 'start' } as const

export function ContactDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [pay, setPay] = useState<boolean>(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [ledgerTab, setLedgerTab] = useState<DebtDirection>(DebtDirection.RECEIVABLE)

  const { data: contact, isPending, refetch } = useQuery({
    queryKey: [...queryKeys.contacts, id],
    queryFn: () => dataClient.contacts.get(id),
    enabled: isElectron && !!id,
  })

  const tp = contact?.type
  const isCustomer = tp === ContactType.CUSTOMER || tp === ContactType.BOTH
  const isSupplier = tp === ContactType.SUPPLIER || tp === ContactType.BOTH
  const isBoth = tp === ContactType.BOTH

  const { data: recvStmt } = useQuery({
    queryKey: [...queryKeys.contacts, id, 'stmt', 'RECEIVABLE'],
    queryFn: () => dataClient.debts.statement(id, DebtDirection.RECEIVABLE),
    enabled: isElectron && !!id && isCustomer,
  })
  const { data: payStmt } = useQuery({
    queryKey: [...queryKeys.contacts, id, 'stmt', 'PAYABLE'],
    queryFn: () => dataClient.debts.statement(id, DebtDirection.PAYABLE),
    enabled: isElectron && !!id && isSupplier,
  })

  const refresh = () => {
    void refetch()
    void qc.invalidateQueries({ queryKey: queryKeys.contacts })
  }

  const removeM = useMutation({
    mutationFn: () => dataClient.contacts.remove(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: queryKeys.contacts }); navigate('/contacts') },
    onError: (e) => setDeleteErr(errorMessage(e, t('ct.deleteError'))),
  })

  if (isPending) return <div className="frame"><div className="cat-empty">{t('ct.loading')}</div></div>
  if (!contact) return <div className="frame"><div className="cat-empty">{t('ct.notFound')}</div></div>

  const typeLabel = isBoth ? t('ct.bothLong') : isSupplier ? t('ct.supplier') : t('ct.customer')
  const net = contact.totalReceivable - contact.totalPayable
  const since = new Date(contact.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  const oldestDays = contact.oldestUnpaidAt ? Math.max(0, Math.floor((Date.now() - new Date(contact.oldestUnpaidAt).getTime()) / 86400000)) : null
  const metaItem = (icon: ReactNode, value: string) => <span className="mi">{icon}<span>{value}</span></span>

  const entryTag = (e: ContactStatementEntry, payable: boolean) => {
    if (e.type === ContactStatementEntryType.OPENING_BALANCE) return <span className="et et-woff">{t('debt.entryOpening')}</span>
    if (e.type === ContactStatementEntryType.PAYMENT) return <span className="et et-pay">{t('debt.entryPayment')}</span>
    if (e.type === ContactStatementEntryType.WRITE_OFF) return <span className="et et-woff">{t('debt.entryWriteOff')}</span>
    return <span className={`et ${payable ? 'et-buy' : 'et-sale'}`}>{payable ? t('debt.entryPurchase') : t('debt.entrySale')}</span>
  }
  const entryRef = (e: ContactStatementEntry): ReactNode => {
    if (e.type === ContactStatementEntryType.OPENING_BALANCE) return t('ct.openingRef')
    if (e.type === ContactStatementEntryType.PAYMENT) {
      const label = t(`debt.method_${e.reference}` as Parameters<typeof t>[0])
      return e.description ? <span>{label} <span className="sub">· {e.description}</span></span> : label
    }
    if (e.type === ContactStatementEntryType.WRITE_OFF) return '—'
    return <span className="mono">{e.reference}</span>
  }

  // Statement ledger: Date · Entry · Reference · debit/credit · running balance.
  const ledgerView = (stmt: ContactStatement | undefined, footLabel: string) => {
    const payable = stmt?.direction === DebtDirection.PAYABLE
    const entries = stmt?.entries ?? []
    const opening: ContactStatementEntry | null = entries.length
      ? { date: entries[0]!.date, type: ContactStatementEntryType.OPENING_BALANCE, direction: stmt!.direction, reference: null, description: '', debit: 0, credit: 0, balance: stmt!.openingBalance }
      : null
    const all = opening ? [opening, ...entries] : entries
    const shown = all.length > 5 ? all.slice(-5) : all // newest 5 on screen; export has all
    const colA = payable ? t('debt.colPayment') : t('debt.colDebit') // payment(credit) | debit
    const colB = payable ? t('debt.colPurchase') : t('debt.colCredit') // purchase(debit) | credit
    return (
      <>
        {all.length === 0 ? (
          <div className="cat-empty">{t('debt.empty')}</div>
        ) : (
          <table className="ltbl">
            <thead>
              <tr>
                <th>{t('debt.colDate')}</th>
                <th>{t('debt.colEntry')}</th>
                <th>{t('debt.colRef')}</th>
                <th className="right">{colA}</th>
                <th className="right">{colB}</th>
                <th className="right">{t('debt.colBalance')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e, i) => {
                // Column A holds the "credit" side for payable (payment), debit otherwise.
                const aVal = payable ? e.credit : e.debit
                const bVal = payable ? e.debit : e.credit
                const aClass = payable ? 't-credit' : 't-debit'
                const bClass = payable ? 't-debit' : 't-credit'
                return (
                  <tr key={i}>
                    <td className="num">{new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td>
                    <td>{entryTag(e, payable)}</td>
                    <td>{entryRef(e)}</td>
                    <td className="right">{aVal > 0 ? <span className={aClass}>{money.format(aVal)}</span> : '—'}</td>
                    <td className="right">{bVal > 0 ? <span className={bClass}>{money.format(bVal)}</span> : '—'}</td>
                    <td className="right"><span className="t-bal">{money.format(e.balance)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="panel-foot">
          <span>{footLabel.replace('{n}', String(entries.length))}</span>
          <div className="spacer" style={{ flex: 1 }} />
          <span>
            {t('ct.closingBalance')}{' '}
            <strong style={{ color: payable ? 'var(--danger)' : 'var(--success)' }}>{money.format(stmt?.closingBalance ?? 0)}</strong>
          </span>
        </div>
      </>
    )
  }

  // --- statement export (full statement, all transactions) -----------------
  const stmtRows = (stmt: ContactStatement | undefined): ContactStatementEntry[] => {
    const entries = stmt?.entries ?? []
    const opening: ContactStatementEntry | null = entries.length
      ? { date: entries[0]!.date, type: ContactStatementEntryType.OPENING_BALANCE, direction: stmt!.direction, reference: null, description: '', debit: 0, credit: 0, balance: stmt!.openingBalance }
      : null
    return opening ? [opening, ...entries] : entries
  }
  const stmtEntryLabel = (e: ContactStatementEntry, payable: boolean): string => {
    if (e.type === ContactStatementEntryType.OPENING_BALANCE) return t('debt.entryOpening')
    if (e.type === ContactStatementEntryType.PAYMENT) return t('debt.entryPayment')
    if (e.type === ContactStatementEntryType.WRITE_OFF) return t('debt.entryWriteOff')
    return payable ? t('debt.entryPurchase') : t('debt.entrySale')
  }
  const stmtEntryRef = (e: ContactStatementEntry): string => {
    if (e.type === ContactStatementEntryType.OPENING_BALANCE) return t('ct.openingRef')
    if (e.type === ContactStatementEntryType.PAYMENT) {
      const label = t(`debt.method_${e.reference}` as Parameters<typeof t>[0])
      return e.description ? `${label} · ${e.description}` : label
    }
    if (e.type === ContactStatementEntryType.WRITE_OFF) return '—'
    return e.reference ?? '—'
  }
  const fmtDay = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  const exportCsv = (stmt: ContactStatement | undefined, title: string) => {
    const payable = stmt?.direction === DebtDirection.PAYABLE
    const head = [t('debt.colDate'), t('debt.colEntry'), t('debt.colRef'), t('debt.colDebit'), t('debt.colCredit'), t('debt.colBalance')]
    const body = stmtRows(stmt).map((e) => [fmtDay(e.date), stmtEntryLabel(e, payable), stmtEntryRef(e), e.debit || '', e.credit || '', e.balance])
    const csv = [head, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n')
    downloadBlob('﻿' + csv, `${exportName(title)}.csv`, 'text/csv;charset=utf-8')
  }
  const statementHtml = (stmt: ContactStatement | undefined, title: string): string => {
    const payable = stmt?.direction === DebtDirection.PAYABLE
    const rows = stmtRows(stmt)
      .map((e) => `<tr><td>${esc(fmtDay(e.date))}</td><td>${esc(stmtEntryLabel(e, payable))}</td><td>${esc(stmtEntryRef(e))}</td><td class="r">${e.debit ? esc(money.format(e.debit)) : '—'}</td><td class="r">${e.credit ? esc(money.format(e.credit)) : '—'}</td><td class="r">${esc(money.format(e.balance))}</td></tr>`)
      .join('')
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{font:13px/1.5 Arial,Helvetica,sans-serif;color:#111;padding:32px}
      h1{font-size:20px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{text-align:left;border-bottom:2px solid #111;padding:8px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#444}
      td{border-bottom:1px solid #ddd;padding:7px 6px}.r{text-align:right}
      tfoot td{border-top:2px solid #111;border-bottom:0;font-weight:700;padding-top:10px}
    </style></head><body>
      <h1>${esc(contact.name)}</h1>
      <div class="sub">${esc(title)} · ${esc(t('ct.title'))}</div>
      <table><thead><tr><th>${t('debt.colDate')}</th><th>${t('debt.colEntry')}</th><th>${t('debt.colRef')}</th><th class="r">${t('debt.colDebit')}</th><th class="r">${t('debt.colCredit')}</th><th class="r">${t('debt.colBalance')}</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5">${esc(t('ct.closingBalance'))}</td><td class="r">${esc(money.format(stmt?.closingBalance ?? 0))}</td></tr></tfoot></table>
    </body></html>`
  }
  const exportPdf = (stmt: ContactStatement | undefined, title: string) => {
    void dataClient.documents.downloadHtmlPdf(statementHtml(stmt, title), exportName(title))
  }
  const exportName = (title: string) => sanitizeName(`statement-${contact.name}-${title}`)
  const exportMenu = (stmt: ContactStatement | undefined, title: string) => (
    <ActionMenu
      label={t('ct.export')}
      items={[
        { label: t('ct.exportPdf'), onClick: () => exportPdf(stmt, title) },
        { label: t('ct.exportCsv'), onClick: () => exportCsv(stmt, title) },
      ]}
    />
  )

  return (
    <div className="frame">
      <div className="detail-top">
        <BackButton onClick={() => navigate('/contacts')}>{t('ct.backToContacts')}</BackButton>
        <div className="acts2">
          {isCustomer ? (
            <Button variant="soft" onClick={() => navigate(`/sell?customer=${id}`)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
              {t('ct.newSale')}
            </Button>
          ) : null}
          {isSupplier ? (
            <Button variant="soft" onClick={() => navigate(`/purchasing/orders/new?supplier=${id}`)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
              {t('ct.newPo')}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => setPay(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>
            {isSupplier && !isCustomer ? t('ct.paySupplier') : t('ct.recordPayment')}
          </Button>
          <ActionMenu
            items={[
              { label: t('ct.edit'), onClick: () => navigate(`/contacts/${id}/edit`) },
              { label: t('ct.delete'), onClick: () => { setConfirmDelete(true); setDeleteErr(null) }, danger: true },
            ]}
          />
        </div>
      </div>

      <div className="dhero">
        <div className="dhero-in">
          <div className="av round">{contact.name.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{t('ct.title')} / {typeLabel}</div>
            <h1>{contact.name}</h1>
            <div className="meta">
              {contact.phone ? metaItem(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 5a1 1 0 0 1 1-1h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l3 2v3a1 1 0 0 1-1 1A16 16 0 0 1 4 5Z" /></svg>, contact.phone) : null}
              {contact.email ? metaItem(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>, contact.email) : null}
              {contact.address ? metaItem(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>, contact.address) : null}
              {metaItem(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>, t('ct.since').replace('{date}', since))}
            </div>
            <div className="badges">
              {isCustomer ? <span className="st st-ok"><span className="d" />{t('ct.customer')}</span> : null}
              {isSupplier ? <span className="st st-low"><span className="d" />{t('ct.supplier')}</span> : null}
              <span className={`st ${contact.isActive ? 'st-brand' : 'st-neutral'}`}><span className="d" />{contact.isActive ? t('ct.active') : t('ct.inactive')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* metrics */}
      {isBoth ? (
        <div className="metrics">
          <div className="mc"><div className="l">{t('ct.mTheyOwe')}</div><div className="v ok">{money.format(contact.totalReceivable)}</div><div className="s">{t('ct.mReceivableSub')}</div></div>
          <div className="mc"><div className="l">{t('ct.mYouOwe')}</div><div className="v bad">{money.format(contact.totalPayable)}</div><div className="s">{t('ct.mPayableSub')}</div></div>
          <div className="mc"><div className="l">{t('ct.mNet')}</div><div className={`v ${net >= 0 ? 'ok' : 'bad'}`}>{net >= 0 ? '+' : '−'}{money.format(Math.abs(net))}</div><div className="s">{net >= 0 ? t('ct.mNetFavour') : t('ct.mNetOwe')}</div></div>
          <div className="mc"><div className="l">{t('ct.openDebts')}</div><div className="v">{contact.openDebts}</div><div className="s">{t('ct.openDebtsHint')}</div></div>
        </div>
      ) : (
        <div className="metrics">
          <div className="mc">
            <div className="l">{t('ct.mOutstanding')}</div>
            <div className={`v ${isSupplier ? 'bad' : 'ok'}`}>{isSupplier ? '−' : '+'}{money.format(isSupplier ? contact.totalPayable : contact.totalReceivable)}</div>
            <div className="s">{isSupplier ? t('ct.mPayableHint') : t('ct.mReceivableHint')}</div>
          </div>
          <div className="mc"><div className="l">{t('ct.openDebts')}</div><div className="v">{contact.openDebts}</div><div className="s">{t('ct.openDebtsHint')}</div></div>
          <div className="mc"><div className="l">{t('ct.mOldest')}</div><div className={`v ${oldestDays != null && oldestDays > 30 ? 'warn' : ''}`}>{oldestDays != null ? t('ct.mOldestDays').replace('{n}', String(oldestDays)) : '—'}</div><div className="s">{t('ct.mOldestSub')}</div></div>
          <div className="mc"><div className="l">{t('ct.mSince')}</div><div className="v">{since}</div><div className="s">{t('ct.mSinceSub')}</div></div>
        </div>
      )}

      {/* both: net-position offset bar */}
      {isBoth && (contact.totalReceivable > 0 || contact.totalPayable > 0) ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: 'var(--success)' }}>{t('ct.mTheyOwe')} {money.format(contact.totalReceivable)}</span>
            <span style={{ color: 'var(--danger)' }}>{t('ct.mYouOwe')} {money.format(contact.totalPayable)}</span>
          </div>
          <div style={{ height: 12, borderRadius: 999, background: 'var(--danger-soft)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${Math.round((contact.totalReceivable / Math.max(1, contact.totalReceivable + contact.totalPayable)) * 100)}%`, background: 'var(--success)', height: '100%' }} />
          </div>
          <div className="hint" style={{ marginTop: 8 }}>{(net >= 0 ? t('ct.offsetFavour') : t('ct.offsetOwe')).replace('{v}', money.format(Math.abs(net)))}</div>
        </div>
      ) : null}

      {/* statement: dual tabs for Both, single ledger otherwise */}
      {isBoth ? (
        <div className="panel mb20">
          <div className="panel-head" style={{ paddingBottom: 0, borderBottom: 0 }}>
            <div className="tabs" style={{ marginBottom: 0, borderBottom: 0 }}>
              <button type="button" className={ledgerTab === DebtDirection.RECEIVABLE ? 'active' : ''} onClick={() => setLedgerTab(DebtDirection.RECEIVABLE)}>
                {t('ct.ledgerAsCustomer')} <span className="cnt">{money.compact(contact.totalReceivable)}</span>
              </button>
              <button type="button" className={ledgerTab === DebtDirection.PAYABLE ? 'active' : ''} onClick={() => setLedgerTab(DebtDirection.PAYABLE)}>
                {t('ct.ledgerAsSupplier')} <span className="cnt">{money.compact(contact.totalPayable)}</span>
              </button>
            </div>
            <div className="spacer" style={{ flex: 1 }} />
            {ledgerTab === DebtDirection.RECEIVABLE
              ? exportMenu(recvStmt, t('ct.ledgerAsCustomer'))
              : exportMenu(payStmt, t('ct.ledgerAsSupplier'))}
          </div>
          {ledgerTab === DebtDirection.RECEIVABLE ? ledgerView(recvStmt, t('ct.ledgerCustFoot')) : ledgerView(payStmt, t('ct.ledgerSuppFoot'))}
        </div>
      ) : (
        <div style={STMT_SPLIT} className="mb20">
          <div className="panel">
            <div className="panel-head">
              <h3>{isSupplier ? t('ct.supplierAccount') : t('ct.statement')}</h3>
              <div className="spacer" style={{ flex: 1 }} />
              <span className={`st ${isSupplier ? 'st-out' : 'st-ok'}`} style={{ fontSize: 12 }}>
                <span className="d" />{money.format(isSupplier ? contact.totalPayable : contact.totalReceivable)}
              </span>
              {exportMenu(isSupplier ? payStmt : recvStmt, isSupplier ? t('ct.supplierAccount') : t('ct.statement'))}
            </div>
            {ledgerView(isSupplier ? payStmt : recvStmt, t('ct.countEntries'))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProfileCard contact={contact} typeLabel={typeLabel} t={t} />
            {isCustomer ? <IdentificationCard contact={contact} t={t} /> : null}
          </div>
        </div>
      )}

      {/* both: relationship profile + identification (record payment lives in the header) */}
      {isBoth ? (
        <div className="split">
          <ProfileCard contact={contact} typeLabel={typeLabel} t={t} relationship />
          <IdentificationCard contact={contact} t={t} />
        </div>
      ) : null}

      {pay ? (
        <ContactPaymentModal contactId={id} contactName={contact.name} onClose={() => setPay(false)} onSaved={() => { refresh(); setPay(false) }} />
      ) : null}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('ct.deleteTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setConfirmDelete(false)} disabled={removeM.isPending}>{t('ct.cancel')}</Button>
            <Button variant="primary" loading={removeM.isPending} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => removeM.mutate()}>{t('ct.delete')}</Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{t('ct.deleteBody').replace('{name}', contact.name)}</p>
        {deleteErr ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{deleteErr}</p> : null}
      </Modal>
    </div>
  )
}

function ProfileCard({
  contact,
  typeLabel,
  t,
  relationship,
}: {
  contact: { phone: string | null; phoneAlt: string | null; email: string | null; address: string | null; notes: string | null }
  typeLabel: string
  t: ReturnType<typeof useT>
  relationship?: boolean
}) {
  return (
    <div className="card">
      <div className="card-h"><div><h3>{relationship ? t('ct.relationshipProfile') : t('ct.profile')}</h3></div></div>
      <div className="fields-grid">
        <div className="fld"><div className="fl">{t('ct.colType')}</div><div className="fv">{typeLabel}</div></div>
        <div className="fld"><div className="fl">{t('ct.phone')}</div><div className="fv">{contact.phone || '—'}</div></div>
        <div className="fld"><div className="fl">{t('ct.phoneAlt')}</div><div className="fv">{contact.phoneAlt || '—'}</div></div>
        <div className="fld"><div className="fl">{t('ct.email')}</div><div className="fv">{contact.email || '—'}</div></div>
        <div className="fld full"><div className="fl">{t('ct.address')}</div><div className="fv">{contact.address || '—'}</div></div>
        <div className="fld full"><div className="fl">{t('ct.notes')}</div><div className="fv">{contact.notes || '—'}</div></div>
      </div>
    </div>
  )
}

const fileName = (url: string) => decodeURIComponent(url.split('/').pop() ?? url)

const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const downloadBlob = (content: string, filename: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
const sanitizeName = (s: string): string => s.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c)

function IdentificationCard({
  contact,
  t,
}: {
  contact: {
    idType: string | null
    idNumber: string | null
    idIssueDate: string | null
    idExpiryDate: string | null
    idDocuments: string[]
    selfieUrl: string | null
  }
  t: ReturnType<typeof useT>
}) {
  const has = !!(contact.idType || contact.idNumber || contact.idIssueDate || contact.idExpiryDate || contact.idDocuments.length || contact.selfieUrl)
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—')
  return (
    <div className="card">
      <div className="card-h"><div><h3>{t('ct.idSection')}</h3></div></div>
      {!has ? (
        <div className="hint">{t('ct.idNone')}</div>
      ) : (
        <>
          <div className="fields-grid">
            <div className="fld"><div className="fl">{t('ct.idType')}</div><div className="fv">{contact.idType ? t(`ct.idType_${contact.idType}` as Parameters<typeof t>[0]) : '—'}</div></div>
            <div className="fld"><div className="fl">{t('ct.idNumber')}</div><div className="fv">{contact.idNumber || '—'}</div></div>
            <div className="fld"><div className="fl">{t('ct.idIssue')}</div><div className="fv">{fmtDate(contact.idIssueDate)}</div></div>
            <div className="fld"><div className="fl">{t('ct.idExpiry')}</div><div className="fv">{fmtDate(contact.idExpiryDate)}</div></div>
          </div>
          {contact.idDocuments.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div className="lbl2" style={{ marginBottom: 6 }}>{t('ct.idDocs')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {contact.idDocuments.map((u, i) => (
                  <a key={`${u}-${i}`} href={u} target="_blank" rel="noreferrer" className="filechip">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                    <span className="filechip-name">{fileName(u)}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          {contact.selfieUrl ? (
            <div style={{ marginTop: 12 }}>
              <div className="lbl2" style={{ marginBottom: 6 }}>{t('ct.selfie')}</div>
              <a href={contact.selfieUrl} target="_blank" rel="noreferrer" className="imgpreview" style={{ display: 'block', maxWidth: 160 }}>
                <img src={contact.selfieUrl} alt={t('ct.selfie')} />
              </a>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
