import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Select } from '@biztrack/ui/biztrack'
import { ContactType, DebtDirection, DebtStatus, PaymentMethod } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { ContactModal } from './Contacts'
import type { LocalDebt } from '@shared/ipc'

export function ContactDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [payTarget, setPayTarget] = useState<LocalDebt | null>(null)

  const { data: contact, isPending, refetch } = useQuery({
    queryKey: [...queryKeys.contacts, id],
    queryFn: () => dataClient.contacts.get(id),
    enabled: isElectron && !!id,
  })
  const { data: debts } = useQuery({
    queryKey: [...queryKeys.contacts, id, 'debts'],
    queryFn: () => dataClient.debts.listByContact(id, { limit: 50 }),
    enabled: isElectron && !!id,
  })

  const refresh = () => {
    void refetch()
    void qc.invalidateQueries({ queryKey: [...queryKeys.contacts, id, 'debts'] })
    void qc.invalidateQueries({ queryKey: queryKeys.contacts })
  }

  if (isPending) return <div className="frame"><div className="cat-empty">{t('ct.loading')}</div></div>
  if (!contact) return <div className="frame"><div className="cat-empty">{t('ct.notFound')}</div></div>

  const typeLabel = contact.type === ContactType.SUPPLIER ? t('ct.supplier') : contact.type === ContactType.CUSTOMER ? t('ct.customer') : t('ct.both')
  const rows = debts?.data ?? []

  const statusPill = (s: DebtStatus) => {
    const cls = s === DebtStatus.SETTLED ? 'st-ok' : s === DebtStatus.WRITTEN_OFF ? 'st-neutral' : s === DebtStatus.PARTIALLY_PAID ? 'st-low' : 'st-out'
    return <span className={`st ${cls}`}>{t(`debt.status_${s}` as Parameters<typeof t>[0])}</span>
  }

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/contacts')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('ct.title')}
      </button>

      <div className="page-head">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span className="u-abbr" style={{ height: 44, minWidth: 44, fontSize: 16 }}>{contact.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <h1>{contact.name}</h1>
            <p>{typeLabel}{contact.phone ? ` · ${contact.phone}` : ''}</p>
          </div>
        </div>
        <Button variant="soft" onClick={() => setEditing(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M14 6l4 4" /></svg>
          {t('ct.edit')}
        </Button>
      </div>

      <div className="minihead">
        <div className="m"><div className="k">{t('ct.weOweLabel')}</div><div className="v" style={{ color: contact.totalPayable > 0 ? 'var(--danger)' : undefined }}>{money.format(contact.totalPayable)}</div><div className="h">{t('ct.payableHint')}</div></div>
        <div className="m"><div className="k">{t('ct.owesUsLabel')}</div><div className="v" style={{ color: contact.totalReceivable > 0 ? 'var(--warning)' : undefined }}>{money.format(contact.totalReceivable)}</div><div className="h">{t('ct.receivableHint')}</div></div>
        <div className="m"><div className="k">{t('ct.openDebts')}</div><div className="v">{contact.openDebts}</div><div className="h">{t('ct.openDebtsHint')}</div></div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('ct.info')}</h3></div></div>
        <div className="kv">
          <div className="row"><span>{t('ct.phone')}</span><span>{contact.phone || '—'}</span></div>
          <div className="row"><span>{t('ct.phoneAlt')}</span><span>{contact.phoneAlt || '—'}</span></div>
          <div className="row"><span>{t('ct.address')}</span><span>{contact.address || '—'}</span></div>
          <div className="row"><span>{t('ct.notes')}</span><span>{contact.notes || '—'}</span></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('ct.transactions')}</h3></div></div>
        {rows.length === 0 ? (
          <div className="hint" style={{ padding: 16 }}>{t('debt.empty')}</div>
        ) : (
          <table className="ltbl">
            <thead>
              <tr>
                <th>{t('debt.colRef')}</th>
                <th>{t('debt.colKind')}</th>
                <th className="right">{t('debt.colAmount')}</th>
                <th className="right">{t('debt.colOutstanding')}</th>
                <th>{t('debt.colStatus')}</th>
                <th className="right">{t('debt.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="nm">{d.sourceReference}</div>
                    <div className="sub">{t(`debt.source_${d.sourceType}` as Parameters<typeof t>[0])} · {new Date(d.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td>{d.direction === DebtDirection.PAYABLE ? t('debt.payable') : t('debt.receivable')}</td>
                  <td className="right num">{money.format(d.originalAmount)}</td>
                  <td className="right num" style={{ color: d.outstandingAmount > 0 ? 'var(--danger)' : 'var(--text-3)' }}>{money.format(d.outstandingAmount)}</td>
                  <td>{statusPill(d.status)}</td>
                  <td className="right">
                    {d.status !== DebtStatus.SETTLED && d.status !== DebtStatus.WRITTEN_OFF ? (
                      <Button variant="soft" onClick={() => setPayTarget(d)} style={{ height: 30 }}>{t('debt.pay')}</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <ContactModal contact={contact} onClose={() => setEditing(false)} onSaved={() => { refresh(); setEditing(false) }} />
      ) : null}
      {payTarget ? (
        <RecordPaymentModal debt={payTarget} onClose={() => setPayTarget(null)} onSaved={() => { refresh(); setPayTarget(null) }} />
      ) : null}
    </div>
  )
}

const PAYMENT_METHODS: PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.MTN_MOMO, PaymentMethod.ORANGE_MONEY, PaymentMethod.CARD]

function RecordPaymentModal({ debt, onClose, onSaved }: { debt: LocalDebt; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const money = useCurrency()
  const [amount, setAmount] = useState(String(debt.outstandingAmount))
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH)
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)

  const num = (s: string) => Number(s.replace(/\s/g, ''))
  const isMomo = method === PaymentMethod.MTN_MOMO || method === PaymentMethod.ORANGE_MONEY

  const save = useMutation({
    mutationFn: () =>
      dataClient.debts.recordPayment(debt.id, {
        amount: num(amount),
        method,
        paymentDate: new Date().toISOString(),
        mobileMoneyReference: isMomo && reference.trim() ? reference.trim() : undefined,
      }),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('debt.payError'))),
  })

  const submit = () => {
    const v = num(amount)
    if (!Number.isFinite(v) || v <= 0) return setError(t('debt.amountInvalid'))
    if (v > debt.outstandingAmount + 1e-6) return setError(t('debt.amountTooHigh'))
    setError(null)
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('debt.payTitle')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={save.isPending}>{t('ct.cancel')}</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>{t('debt.payConfirm')}</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
        {t('debt.outstandingIs').replace('{v}', money.format(debt.outstandingAmount))}
      </p>
      <div className="form-2col">
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('debt.amount')}</label>
          <Input value={amount} inputMode="decimal" onChange={(e) => { setAmount(e.target.value); setError(null) }} />
        </div>
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('debt.method')}</label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{t(`debt.method_${m}` as Parameters<typeof t>[0])}</option>
            ))}
          </Select>
        </div>
      </div>
      {isMomo ? (
        <div className="ff">
          <label className="lbl2">{t('debt.momoRef')}</label>
          <Input value={reference} placeholder={t('debt.momoRefPh')} onChange={(e) => setReference(e.target.value)} />
        </div>
      ) : null}
      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
    </Modal>
  )
}
