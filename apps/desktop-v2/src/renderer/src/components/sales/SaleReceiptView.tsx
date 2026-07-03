import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { ReceiptSendDialog } from '@/components/receipt/ReceiptSendDialog'
import { formatSaleTime, saleInitials, salePayLabel, saleStatusInfo } from './sale-format'

const I = {
  print: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16v12H7l-3 3z" /></svg>,
}

/**
 * Self-contained receipt card for a single sale (header + customer + line items +
 * totals + print/send). Fetches the sale by id and renders the shared `.receipt`
 * card — used inline by the tablet two-pane detail and the mobile receipt sheet.
 * (The desktop Sales route keeps its own right-side SaleDetailDrawer.)
 */
export function SaleReceiptView({ saleId }: { saleId: string }) {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const [printing, setPrinting] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)

  const { data: sale, isPending } = useQuery({
    queryKey: ['sales', 'detail', saleId],
    queryFn: () => dataClient.sales.get(saleId),
    enabled: !!saleId,
  })
  const { data: customer } = useQuery({
    queryKey: ['contact-selfie', sale?.customerId],
    queryFn: () => dataClient.contacts.get(sale!.customerId!),
    enabled: !!sale?.customerId,
  })

  if (isPending || !sale) return <div className="cat-empty">{t('sales.loading')}</div>

  const st = saleStatusInfo(t, sale)
  const custName = sale.customerName ?? t('sales.walkIn')
  const flash = (msg: string) => {
    setNote(msg)
    window.setTimeout(() => setNote(null), 2400)
  }
  const print = async () => {
    setPrinting(true)
    try {
      const r = await dataClient.sales.printReceipt(sale.id, lang)
      flash(r.printed ? t('sales.printed') : t('sales.printSaved'))
    } catch {
      flash(t('sales.printFailed'))
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="receipt">
      <div className="receipt-h">
        <div className="rid">{t('sales.receiptNo').replace('{n}', sale.saleNumber)}</div>
        <div className="ramt">{money.format(sale.totalAmount)}</div>
        <div className="rmeta">
          <span className={`st ${st.cls}`}><span className="d" />{st.label}</span>
          <span className="chip-tag">{salePayLabel(t, sale.paymentMethod)}</span>
          <span className="chip-tag">{formatSaleTime(sale.soldAt, lang)}</span>
        </div>
      </div>

      <div className="receipt-b">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div className="avatar av-brand" style={{ width: 34, height: 34, fontSize: 12 }}>
            {customer?.selfieUrl ? <img src={customer.selfieUrl} alt="" /> : saleInitials(custName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{custName}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sale.customerPhone ?? '—'}</div>
          </div>
        </div>
        {sale.items.map((it) => (
          <div key={it.id} className="receipt-line">
            <span className="q">{it.quantity}</span>
            <div className="nm">
              {it.productName}
              {it.variantName ? ` · ${it.variantName}` : ''}
              {it.serialNumber ? ` · ${it.serialNumber}` : ''}
              <div className="u">{money.format(it.unitPrice)} {t('sales.each') as string}</div>
            </div>
            <span className="lt">{money.format(it.lineTotal)}</span>
          </div>
        ))}
      </div>

      <div className="receipt-tot">
        <div className="tr"><span>{t('sales.subtotal')}</span><span className="num">{money.format(sale.subtotal)}</span></div>
        {sale.discountAmount > 0 ? <div className="tr"><span>{t('sales.discount')}</span><span className="num">− {money.format(sale.discountAmount)}</span></div> : null}
        {sale.chargesAmount > 0 ? <div className="tr"><span>{t('sales.charges')}</span><span className="num">+ {money.format(sale.chargesAmount)}</span></div> : null}
        {sale.creditAmount > 0 ? <div className="tr"><span>{t('sales.credit')}</span><span className="num">{money.format(sale.creditAmount)}</span></div> : null}
        {sale.changeGiven > 0 ? <div className="tr"><span>{t('sales.change')}</span><span className="num">{money.format(sale.changeGiven)}</span></div> : null}
        <div className="tr g">
          <span>{sale.creditAmount > 0 ? t('sales.totalDue') : t('sales.totalPaid')}</span>
          <span>{money.format(sale.creditAmount > 0 ? sale.totalAmount : sale.amountPaid)}</span>
        </div>
      </div>

      <div className="receipt-act">
        <button type="button" disabled={printing} onClick={() => void print()}>{I.print}{printing ? '…' : t('sales.print')}</button>
        <button type="button" className="primary" onClick={() => setSendOpen(true)}>{I.send}{t('sales.sendReceipt')}</button>
      </div>

      {note ? <div className="hint" style={{ textAlign: 'center', padding: '0 18px 14px' }}>{note}</div> : null}
      {sendOpen ? <ReceiptSendDialog sale={sale} customerName={custName} locale={lang} onClose={() => setSendOpen(false)} /> : null}
    </div>
  )
}
