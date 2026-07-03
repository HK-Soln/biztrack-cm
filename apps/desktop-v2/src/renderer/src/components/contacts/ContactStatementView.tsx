import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ContactStatementEntryType, ContactType, DebtDirection } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { ContactPaymentModal } from '@/components/ContactPaymentModal'
import type { ContactStatementEntry } from '@shared/ipc'

/**
 * Compact account statement for one contact (hero + key figures + record-payment /
 * new-sale actions + recent activity). Fetches the contact and its primary ledger
 * by id; renders no page chrome. Shared by the tablet two-pane detail and the
 * mobile statement sheet. A "view full profile" link opens the full ContactDetail.
 */
export function ContactStatementView({ contactId }: { contactId: string }) {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [pay, setPay] = useState(false)

  const { data: contact, isPending } = useQuery({
    queryKey: [...queryKeys.contacts, contactId],
    queryFn: () => dataClient.contacts.get(contactId),
    enabled: !!contactId,
  })

  const tp = contact?.type
  const isCustomer = tp === ContactType.CUSTOMER || tp === ContactType.BOTH
  const isSupplier = tp === ContactType.SUPPLIER || tp === ContactType.BOTH
  const dir = isSupplier && !isCustomer ? DebtDirection.PAYABLE : DebtDirection.RECEIVABLE

  const { data: stmt } = useQuery({
    queryKey: [...queryKeys.contacts, contactId, 'stmt', dir],
    queryFn: () => dataClient.debts.statement(contactId, dir),
    enabled: !!contact,
  })

  if (isPending || !contact) return <div className="cat-empty">{t('ct.loading')}</div>

  const net = contact.totalReceivable - contact.totalPayable
  const owed = net >= 0
  const since = new Date(contact.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  const oldestDays = contact.oldestUnpaidAt ? Math.max(0, Math.floor((Date.now() - new Date(contact.oldestUnpaidAt).getTime()) / 86400000)) : null

  const entryLabel = (e: ContactStatementEntry): string => {
    switch (e.type) {
      case ContactStatementEntryType.OPENING_BALANCE: return t('debt.entryOpening')
      case ContactStatementEntryType.PAYMENT: return t('debt.entryPayment')
      case ContactStatementEntryType.WRITE_OFF: return t('debt.entryWriteOff')
      default: return dir === DebtDirection.PAYABLE ? t('debt.entryPurchase') : t('debt.entrySale')
    }
  }
  const recent = [...(stmt?.entries ?? [])].slice(-6).reverse()

  return (
    <div className="cstmt">
      <div className="cstmt-hero">
        <div className="avatar av-brand round" style={{ width: 52, height: 52, fontSize: 17 }}>
          {contact.selfieUrl ? <img src={contact.selfieUrl} alt="" /> : contact.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2>{contact.name}</h2>
          <div className="sub">{contact.phone || '—'} · {isSupplier && !isCustomer ? t('ct.supplier') : isCustomer && isSupplier ? t('ct.both') : t('ct.customer')}</div>
        </div>
      </div>

      <div className="cstmt-figs">
        <div className="fig"><div className="k">{t('ct.colBalance')}</div><div className={`v ${owed ? 'ok' : 'bad'}`}>{owed ? '+' : '−'}{money.format(Math.abs(net))}</div><div className="h">{owed ? t('ct.mReceivableSub') : t('ct.mPayableSub')}</div></div>
        <div className="fig"><div className="k">{t('ct.openDebts')}</div><div className="v">{contact.openDebts}</div><div className="h">{t('ct.openDebtsHint')}</div></div>
        <div className="fig"><div className="k">{t('ct.mOldest')}</div><div className={`v ${oldestDays != null && oldestDays > 30 ? 'warn' : ''}`}>{oldestDays != null ? t('ct.mOldestDays').replace('{n}', String(oldestDays)) : '—'}</div><div className="h">{t('ct.mOldestSub')}</div></div>
        <div className="fig"><div className="k">{t('ct.mSince')}</div><div className="v">{since}</div><div className="h">{t('ct.mSinceSub')}</div></div>
      </div>

      <div className="cstmt-acts">
        <button type="button" className="btn btn-primary" onClick={() => setPay(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>
          {isSupplier && !isCustomer ? t('ct.paySupplier') : t('ct.recordPayment')}
        </button>
        {isCustomer ? (
          <button type="button" className="btn" onClick={() => navigate(`/sell?customer=${contactId}`)}>{t('ct.newSale')}</button>
        ) : isSupplier ? (
          <button type="button" className="btn" onClick={() => navigate(`/purchasing/orders/new?supplier=${contactId}`)}>{t('ct.newPo')}</button>
        ) : null}
      </div>

      <div className="m-sec" style={{ textTransform: 'uppercase' }}>{t('ct.recentActivity')}</div>
      {recent.length === 0 ? (
        <div className="cat-empty">{t('debt.empty')}</div>
      ) : (
        <div className="cstmt-led">
          {recent.map((e, i) => {
            const isPayment = e.type === ContactStatementEntryType.PAYMENT
            const amt = e.credit || e.debit
            return (
              <div key={i} className="led">
                <span className={`et ${isPayment ? 'cred' : 'sale'}`}>{entryLabel(e)}</span>
                <div className="lt">
                  <div className="d">{e.reference ?? entryLabel(e)}</div>
                  <div className="s">{new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
                </div>
                <div className={`amt ${isPayment ? 'up' : 'dn'}`}>{isPayment ? '− ' : ''}{money.format(amt)}</div>
              </div>
            )
          })}
        </div>
      )}

      <button type="button" className="cstmt-full" onClick={() => navigate(`/contacts/${contactId}`)}>
        {t('ct.viewFull')}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6" /></svg>
      </button>

      {pay ? (
        <ContactPaymentModal
          contactId={contactId}
          contactName={contact.name}
          onClose={() => setPay(false)}
          onSaved={() => { void qc.invalidateQueries({ queryKey: queryKeys.contacts }); setPay(false) }}
        />
      ) : null}
    </div>
  )
}
