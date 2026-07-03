import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Select } from '@biztrack/ui/biztrack'
import { PaymentMethod } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { todayIso } from '@/lib/date'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { FileUpload } from '@/components/FileUpload'
import type { RestockChargeLineInput, RestockDiscountLineInput, RestockItemInput, RestockPaymentLineInput } from '@shared/ipc'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)
const round2 = (n: number) => Math.round(n * 100) / 100
const newId = () => crypto.randomUUID()

const TENDERS: PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.MTN_MOMO, PaymentMethod.ORANGE_MONEY, PaymentMethod.CARD]
const isMomo = (m: PaymentMethod) => m === PaymentMethod.MTN_MOMO || m === PaymentMethod.ORANGE_MONEY

interface ChargeRow { id: string; chargeTypeId: string | null; name: string; rateType: 'PERCENT' | 'FIXED'; value: string }
interface DiscountRow { id: string; description: string; discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: string }
interface PaymentRow { id: string; method: PaymentMethod; amount: string; momoRef: string }

/**
 * Reusable settlement + payment panel for a goods receipt (PO receive or ad-hoc
 * restock). The parent owns the received items + subtotal; this panel owns charges,
 * discounts, split payments, the supplier invoice, and (for ad-hoc restocks) the
 * supplier picker, and performs the restock on confirm.
 */
export function SettlementPanel({
  subtotal,
  buildItems,
  supplier,
  allowSupplierPick,
  purchaseOrderId,
  defaultReference = '',
  onDone,
}: {
  subtotal: number
  buildItems: () => RestockItemInput[]
  supplier: { id: string | null; name: string | null }
  allowSupplierPick: boolean
  purchaseOrderId?: string | null
  defaultReference?: string
  onDone: () => void
}) {
  const t = useT()
  const money = useCurrency()
  const qc = useQueryClient()

  const { data: chargeTypes = [] } = useQuery({ queryKey: ['charge-types'], queryFn: () => dataClient.charges.listActive(), enabled: isElectron })
  const { data: suppliers = [] } = useQuery({
    queryKey: [...queryKeys.contacts, 'suppliers'],
    queryFn: () => dataClient.contacts.listAllSuppliers(),
    enabled: isElectron && allowSupplierPick,
  })
  const loadSuppliers = useCallback(
    async (search: string) => {
      const q = search.trim().toLowerCase()
      return suppliers.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.phone ?? '').includes(q)).slice(0, 30).map((s) => ({ value: s.id, label: s.name, sublabel: s.phone ?? undefined }))
    },
    [suppliers],
  )

  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [discounts, setDiscounts] = useState<DiscountRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [paymentsTouched, setPaymentsTouched] = useState(false)
  const [reference, setReference] = useState(defaultReference)
  const [supplierId, setSupplierId] = useState<string | null>(supplier.id)
  const [supplierName, setSupplierName] = useState<string | null>(supplier.name)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayIso)
  const [invoiceFileUrl, setInvoiceFileUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const chargeAmt = (c: ChargeRow) => round2(c.rateType === 'PERCENT' ? subtotal * (num(c.value) / 100) : num(c.value))
  const discAmt = (d: DiscountRow) => round2(d.discountType === 'PERCENTAGE' ? subtotal * (num(d.value) / 100) : num(d.value))
  const chargesAmount = round2(charges.reduce((s, c) => s + chargeAmt(c), 0))
  const discountAmount = round2(discounts.reduce((s, d) => s + discAmt(d), 0))
  const total = round2(Math.max(0, subtotal - discountAmount + chargesAmount))
  const paid = round2(payments.reduce((s, p) => s + num(p.amount), 0))
  const balance = round2(total - paid)
  const credit = Math.max(0, balance)
  const overpaid = Math.max(0, -balance)

  useEffect(() => {
    if (paymentsTouched) return
    setPayments([{ id: newId(), method: PaymentMethod.CASH, amount: total > 0 ? String(total) : '', momoRef: '' }])
  }, [paymentsTouched, total])

  const addFromMenu = (value: string) => {
    if (value === 'custom') setCharges((c) => [...c, { id: newId(), chargeTypeId: null, name: '', rateType: 'FIXED', value: '' }])
    else if (value === 'discount') setDiscounts((d) => [...d, { id: newId(), description: '', discountType: 'FIXED_AMOUNT', value: '' }])
    else if (value.startsWith('ct:')) {
      const ct = chargeTypes.find((x) => x.id === value.slice(3))
      if (ct) setCharges((c) => [...c, { id: newId(), chargeTypeId: ct.id, name: ct.name, rateType: ct.rateType, value: String(ct.defaultValue || '') }])
    }
    setErr(null)
  }
  const patchCharge = (id: string, p: Partial<ChargeRow>) => setCharges((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const patchDiscount = (id: string, p: Partial<DiscountRow>) => setDiscounts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)))
  const toggleMethod = (method: PaymentMethod) => {
    setPaymentsTouched(true)
    setPayments((ps) => {
      if (ps.find((p) => p.method === method)) return ps.filter((p) => p.method !== method)
      return [...ps, { id: newId(), method, amount: ps.length === 0 && total > 0 ? String(total) : '', momoRef: '' }]
    })
  }
  const setPayment = (mid: string, p: Partial<PaymentRow>) => { setPaymentsTouched(true); setPayments((ps) => ps.map((x) => (x.id === mid ? { ...x, ...p } : x))) }
  const applyRemainingAsDiscount = () => credit > 0 && setDiscounts((d) => [...d, { id: newId(), description: t('recv.discountLine'), discountType: 'FIXED_AMOUNT', value: String(credit) }])
  const recordExtraAsCharge = () => overpaid > 0 && setCharges((c) => [...c, { id: newId(), chargeTypeId: null, name: '', rateType: 'FIXED', value: String(overpaid) }])

  const save = useMutation({
    mutationFn: () => {
      const chargeLines: RestockChargeLineInput[] = charges.map((c) => ({ id: c.id, chargeTypeId: c.chargeTypeId, name: c.name.trim() || t('recv.customCharge'), rateType: c.rateType, rateValue: num(c.value), amount: chargeAmt(c) }))
      const discountLines: RestockDiscountLineInput[] = discounts.map((d) => ({ id: d.id, description: d.description.trim() || t('recv.discountLine'), discountType: d.discountType, rate: d.discountType === 'PERCENTAGE' ? num(d.value) : null, amount: discAmt(d) }))
      const paymentLines: RestockPaymentLineInput[] = payments.filter((p) => num(p.amount) > 0).map((p) => ({ method: p.method, amount: num(p.amount), mobileMoneyReference: isMomo(p.method) ? p.momoRef.trim() || null : null }))
      return dataClient.inventory.restock({
        purchaseOrderId: purchaseOrderId ?? null,
        supplierId: supplierId ?? null,
        reference: reference.trim() || null,
        items: buildItems(),
        charges: chargeLines,
        discounts: discountLines,
        payments: paymentLines,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate || null,
        invoiceFileUrl,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      void qc.invalidateQueries({ queryKey: queryKeys.inventory })
      void qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders })
      onDone()
    },
    onError: (e) => setErr(errorMessage(e, t('recv.error'))),
  })

  const submit = () => {
    if (buildItems().length === 0) return setErr(t('recv.nothing'))
    if (credit > 0 && !supplierId) return setErr(t('recv.supplierRequired'))
    if (credit > 0 && !invoiceFileUrl) return setErr(t('recv.invoiceRequired'))
    setErr(null)
    save.mutate()
  }

  const methodLabel = (m: PaymentMethod) => ({ [PaymentMethod.CASH]: t('recv.pmCash'), [PaymentMethod.MTN_MOMO]: t('recv.pmMtn'), [PaymentMethod.ORANGE_MONEY]: t('recv.pmOrange'), [PaymentMethod.CARD]: t('recv.pmCard') } as Record<string, string>)[m] ?? m

  return (
    <div className="card">
      {allowSupplierPick ? (
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('recv.supplier')}</label>
          <CommandSelect value={supplierId} valueLabel={supplierName} onChange={(id, opt) => { setSupplierId(id); setSupplierName(opt?.label ?? null); setErr(null) }} loadOptions={loadSuppliers} placeholder={t('recv.pickSupplier')} searchPlaceholder={t('field.searchSuppliers')} />
        </div>
      ) : null}

      {/* Charges & discounts */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div className="fsec-h" style={{ marginBottom: 0 }}>{t('recv.adjustments')}</div>
        <select className="input" value="" onChange={(e) => { addFromMenu(e.target.value); e.currentTarget.value = '' }} style={{ height: 32, maxWidth: 150 }}>
          <option value="" disabled>{t('recv.add')}</option>
          <optgroup label={t('recv.charges')}>
            {chargeTypes.map((ct) => <option key={ct.id} value={`ct:${ct.id}`}>{ct.name}</option>)}
            <option value="custom">{t('recv.customCharge')}</option>
          </optgroup>
          <optgroup label={t('recv.discounts')}>
            <option value="discount">{t('recv.discountLine')}</option>
          </optgroup>
        </select>
      </div>

      {charges.map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Input value={c.name} placeholder={t('recv.chargeNamePh')} onChange={(e) => patchCharge(c.id, { name: e.target.value })} disabled={!!c.chargeTypeId} style={{ flex: 1, height: 30, minWidth: 0 }} />
          <button type="button" className="seg-toggle" onClick={() => patchCharge(c.id, { rateType: c.rateType === 'PERCENT' ? 'FIXED' : 'PERCENT' })} style={{ height: 30, minWidth: 34 }}>{c.rateType === 'PERCENT' ? '%' : money.symbol}</button>
          <Input value={c.value} inputMode="decimal" placeholder="0" onChange={(e) => patchCharge(c.id, { value: e.target.value })} style={{ width: 76, height: 30, textAlign: 'right' }} />
          <button type="button" className="icon-btn" aria-label={t('recv.removeLine')} onClick={() => setCharges((cs) => cs.filter((x) => x.id !== c.id))} style={{ width: 28, height: 28 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      ))}
      {discounts.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Input value={d.description} placeholder={t('recv.discountDescPh')} onChange={(e) => patchDiscount(d.id, { description: e.target.value })} style={{ flex: 1, height: 30, minWidth: 0 }} />
          <button type="button" className="seg-toggle" onClick={() => patchDiscount(d.id, { discountType: d.discountType === 'PERCENTAGE' ? 'FIXED_AMOUNT' : 'PERCENTAGE' })} style={{ height: 30, minWidth: 34 }}>{d.discountType === 'PERCENTAGE' ? '%' : money.symbol}</button>
          <Input value={d.value} inputMode="decimal" placeholder="0" onChange={(e) => patchDiscount(d.id, { value: e.target.value })} style={{ width: 76, height: 30, textAlign: 'right' }} />
          <button type="button" className="icon-btn" aria-label={t('recv.removeLine')} onClick={() => setDiscounts((ds) => ds.filter((x) => x.id !== d.id))} style={{ width: 28, height: 28 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      ))}

      {/* Totals */}
      <div style={{ marginTop: 10 }}>
        <div className="recv-tot"><span style={{ color: 'var(--text-2)' }}>{t('recv.subtotal')}</span><span>{money.format(subtotal)}</span></div>
        {discountAmount > 0 ? <div className="recv-tot"><span className="neg">{t('recv.discounts')}</span><span className="neg">−{money.format(discountAmount)}</span></div> : null}
        {chargesAmount > 0 ? <div className="recv-tot"><span style={{ color: 'var(--text-2)' }}>{t('recv.charges')}</span><span>+{money.format(chargesAmount)}</span></div> : null}
        <div className="recv-tot grand"><span>{t('recv.invoiceTotal')}</span><span>{money.format(total)}</span></div>
      </div>

      {/* Supplier invoice */}
      <div className="fsec-h" style={{ marginTop: 16, marginBottom: 8 }}>{t('recv.invoiceSection')}{credit > 0 ? <span style={{ color: 'var(--danger)' }}> *</span> : null}</div>
      <div className="form-2col">
        <div className="ff"><label className="lbl2">{t('recv.invoiceNumber')}</label><Input value={invoiceNumber} placeholder={t('recv.invoiceNumberPh')} onChange={(e) => setInvoiceNumber(e.target.value)} /></div>
        <div className="ff"><label className="lbl2">{t('recv.invoiceDate')}</label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
      </div>
      <div className="ff" style={{ marginTop: 10 }}>
        <FileUpload value={invoiceFileUrl} onChange={(u) => { setInvoiceFileUrl(u); setErr(null) }} folder="invoices" variant="file" hint={t('recv.invoiceHint')} />
      </div>

      {/* Payment */}
      <div className="fsec-h" style={{ marginTop: 16, marginBottom: 8 }}>{t('recv.payments')}</div>
      <div className="pm-chips">
        {TENDERS.map((m) => (
          <button key={m} type="button" className={`pm-chip${payments.some((p) => p.method === m) ? ' active' : ''}`} onClick={() => toggleMethod(m)}>{methodLabel(m)}</button>
        ))}
      </div>
      {payments.map((p) => (
        <div key={p.id} className="pay-row">
          <span className="pm-name">{methodLabel(p.method)}</span>
          {isMomo(p.method) ? <Input value={p.momoRef} placeholder={t('recv.momoRef')} onChange={(e) => setPayment(p.id, { momoRef: e.target.value })} style={{ width: 120, height: 32 }} /> : null}
          <Input value={p.amount} inputMode="decimal" placeholder="0" onChange={(e) => setPayment(p.id, { amount: e.target.value })} style={{ width: 110, height: 32, textAlign: 'right' }} />
        </div>
      ))}

      <div style={{ marginTop: 10 }}>
        <div className="recv-tot"><span style={{ color: 'var(--text-2)' }}>{t('recv.paid')}</span><span>{money.format(paid)}</span></div>
        {credit > 0 ? <div className="recv-tot"><span className="neg" style={{ fontWeight: 700 }}>{t('recv.credit')}</span><span className="neg" style={{ fontWeight: 700 }}>{money.format(credit)}</span></div> : null}
        {overpaid > 0 ? <div className="recv-tot"><span style={{ fontWeight: 700 }}>{t('recv.overpaid')}</span><span style={{ fontWeight: 700 }}>{money.format(overpaid)}</span></div> : null}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
        {credit > 0 ? <button type="button" className="link-btn" onClick={applyRemainingAsDiscount}>{t('recv.applyAsDiscount')}</button> : null}
        {overpaid > 0 ? <button type="button" className="link-btn" onClick={recordExtraAsCharge}>{t('recv.recordAsCharge')}</button> : null}
      </div>
      {credit > 0 ? <div className="hint" style={{ marginTop: 6 }}>{t('recv.creditNote')}</div> : null}

      <div className="ff" style={{ marginTop: 14 }}>
        <label className="lbl2">{t('recv.reference')}</label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>

      {err ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{err}</p> : null}
      <Button variant="primary" loading={save.isPending} onClick={submit} style={{ width: '100%', marginTop: 14 }}>
        {t('recv.confirm').replace('{v}', money.format(total))}
      </Button>
    </div>
  )
}
