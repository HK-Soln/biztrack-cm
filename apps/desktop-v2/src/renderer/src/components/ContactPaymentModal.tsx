import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Modal } from '@biztrack/ui/biztrack'
import { DebtDirection, DebtStatus, PaymentMethod } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'

const TENDERS: PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.MTN_MOMO, PaymentMethod.ORANGE_MONEY, PaymentMethod.CARD]
const isMomo = (m: PaymentMethod) => m === PaymentMethod.MTN_MOMO || m === PaymentMethod.ORANGE_MONEY
const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)
const round2 = (n: number) => Math.round(n * 100) / 100
const newId = () => crypto.randomUUID()

interface PaymentRow { id: string; method: PaymentMethod; amount: string; momoRef: string }

/**
 * Record one or more payments against a contact's open debt. The debt is chosen with a
 * searchable command-select (a contact may have many). A single debt can be settled by
 * several methods at once (split), but each method appears at most once.
 */
export function ContactPaymentModal({
  contactId,
  contactName,
  preselectDebtId,
  onClose,
  onSaved,
}: {
  contactId: string
  contactName: string
  preselectDebtId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const money = useCurrency()

  const { data, isPending } = useQuery({
    queryKey: [...queryKeys.contacts, contactId, 'debts'],
    queryFn: () => dataClient.debts.listByContact(contactId, { limit: 100 }),
  })
  const openDebts = useMemo(
    () => (data?.data ?? []).filter((d) => d.status !== DebtStatus.SETTLED && d.status !== DebtStatus.WRITTEN_OFF && d.outstandingAmount > 0),
    [data],
  )

  const [debtId, setDebtId] = useState('')
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [inited, setInited] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = openDebts.find((d) => d.id === debtId) ?? null

  const seedFor = (outstanding: number): PaymentRow[] => [{ id: newId(), method: PaymentMethod.CASH, amount: String(outstanding), momoRef: '' }]

  // Default the selection once debts load (preselected, else the first open debt).
  useEffect(() => {
    if (inited || openDebts.length === 0) return
    const initial = openDebts.find((d) => d.id === preselectDebtId) ?? openDebts[0]!
    setDebtId(initial.id)
    setPayments(seedFor(initial.outstandingAmount))
    setInited(true)
  }, [inited, openDebts, preselectDebtId])

  const dirLabel = (d: { direction: DebtDirection }) => (d.direction === DebtDirection.PAYABLE ? t('debt.payable') : t('debt.receivable'))
  const loadDebtOptions = useCallback(
    async (search: string) => {
      const q = search.trim().toLowerCase()
      return openDebts
        .filter((d) => !q || d.sourceReference.toLowerCase().includes(q))
        .map((d) => ({ value: d.id, label: d.sourceReference, sublabel: `${dirLabel(d)} · ${money.format(d.outstandingAmount)}` }))
    },
    [openDebts],
  )

  const pickDebt = (id: string | null) => {
    if (!id) return
    setDebtId(id)
    const d = openDebts.find((x) => x.id === id)
    setPayments(seedFor(d?.outstandingAmount ?? 0))
    setError(null)
  }

  const outstanding = selected?.outstandingAmount ?? 0
  const paid = round2(payments.reduce((s, p) => s + num(p.amount), 0))
  const remaining = round2(outstanding - paid)

  const toggleMethod = (method: PaymentMethod) => {
    setError(null)
    setPayments((ps) => {
      if (ps.find((p) => p.method === method)) return ps.filter((p) => p.method !== method)
      return [...ps, { id: newId(), method, amount: remaining > 0 ? String(remaining) : '', momoRef: '' }]
    })
  }
  const setPayment = (id: string, p: Partial<PaymentRow>) => setPayments((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const save = useMutation({
    mutationFn: async () => {
      // Date-only (YYYY-MM-DD) — the API validates paymentDate as a calendar date, not a
      // timestamp; a full ISO datetime is rejected (400).
      const today = new Date().toLocaleDateString('en-CA')
      // One recordPayment call per method line — sequential so the outstanding recomputes.
      for (const p of payments.filter((x) => num(x.amount) > 0)) {
        await dataClient.debts.recordPayment(selected!.id, {
          amount: num(p.amount),
          method: p.method,
          paymentDate: today,
          mobileMoneyReference: isMomo(p.method) && p.momoRef.trim() ? p.momoRef.trim() : undefined,
        })
      }
    },
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('debt.payError'))),
  })

  const submit = () => {
    if (!selected) return
    if (paid <= 0) return setError(t('debt.amountInvalid'))
    if (paid > outstanding + 1e-6) return setError(t('debt.amountTooHigh'))
    setError(null)
    save.mutate()
  }

  const methodLabel = (m: PaymentMethod) => t(`debt.method_${m}` as Parameters<typeof t>[0])

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      title={t('debt.payTitle')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={save.isPending}>{t('ct.cancel')}</Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!selected || paid <= 0}>{t('debt.payConfirm')}</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('debt.payFor').replace('{name}', contactName)}</p>

      {isPending ? (
        <div className="hint">{t('ct.loading')}</div>
      ) : !selected ? (
        <div className="hint">{t('debt.noOpen')}</div>
      ) : (
        <>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('debt.selectDebt')}</label>
            <CommandSelect
              value={selected.id}
              valueLabel={selected.sourceReference}
              onChange={pickDebt}
              loadOptions={loadDebtOptions}
              placeholder={t('debt.selectDebt')}
              searchPlaceholder={t('debt.searchDebt')}
            />
          </div>

          <div className="ff" style={{ marginBottom: 6 }}>
            <label className="lbl2">{t('debt.method')}</label>
            <div className="pm-chips">
              {TENDERS.map((m) => (
                <button key={m} type="button" className={`pm-chip${payments.some((p) => p.method === m) ? ' active' : ''}`} onClick={() => toggleMethod(m)}>{methodLabel(m)}</button>
              ))}
            </div>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="pay-row">
              <span className="pm-name">{methodLabel(p.method)}</span>
              {isMomo(p.method) ? <Input value={p.momoRef} placeholder={t('debt.momoRefPh')} onChange={(e) => setPayment(p.id, { momoRef: e.target.value })} style={{ width: 120, height: 32 }} /> : null}
              <Input value={p.amount} inputMode="decimal" placeholder="0" onChange={(e) => { setPayment(p.id, { amount: e.target.value }); setError(null) }} style={{ width: 120, height: 32, textAlign: 'right' }} />
            </div>
          ))}

          <div style={{ marginTop: 12 }}>
            <div className="recv-tot"><span style={{ color: 'var(--text-2)' }}>{t('debt.outstanding')}</span><span>{money.format(outstanding)}</span></div>
            <div className="recv-tot"><span style={{ color: 'var(--text-2)' }}>{t('debt.paid')}</span><span>{money.format(paid)}</span></div>
            <div className="recv-tot grand"><span>{remaining >= 0 ? t('debt.remaining') : t('debt.overpaid')}</span><span className={remaining < 0 ? 'neg' : undefined}>{money.format(Math.abs(remaining))}</span></div>
          </div>
        </>
      )}
      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
    </Modal>
  )
}
