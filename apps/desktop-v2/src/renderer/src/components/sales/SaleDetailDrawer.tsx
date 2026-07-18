import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { useSessionStore } from '@/stores/session.store'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { ReceiptSendDialog } from '@/components/receipt/ReceiptSendDialog'
import { isWindows } from '@/lib/titlebar'
import { formatSaleDateTime, saleInitials, salePayLabel, saleStatusInfo } from './sale-format'

const VOID_MIN_REASON = 10

const I = {
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
      <path d="M8 8h8M8 12h8" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  print: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 4h16v12H7l-3 3z" />
    </svg>
  ),
}

/**
 * Right-side drawer showing a full sale (customer, line items, totals) with
 * print + send actions. Reused by the Sales route and the dashboard recent-sales
 * tables. Renders nothing when `saleId` is null; closes on overlay click or Esc.
 *
 * It slides in and out: the panel mounts closed (translated off-screen) then flips
 * to `.open` on the next frame so the CSS transition runs, and on close it stays
 * mounted through the exit transition before unmounting.
 */
export function SaleDetailDrawer({
  saleId,
  onClose,
}: {
  saleId: string | null
  onClose: () => void
}) {
  const [renderId, setRenderId] = useState<string | null>(saleId)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (saleId) {
      setRenderId(saleId)
      const r = requestAnimationFrame(() => setOpen(true))
      return () => cancelAnimationFrame(r)
    }
    setOpen(false)
    const tmo = window.setTimeout(() => setRenderId(null), 260)
    return () => window.clearTimeout(tmo)
  }, [saleId])

  useEffect(() => {
    if (!saleId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saleId, onClose])

  if (!renderId) return null
  return (
    <>
      <div className={`drawer-ov${open ? ' open' : ''}`} onClick={onClose} />
      <aside
        className={`drawer${open ? ' open' : ''}${isWindows ? ' below-titlebar' : ''}`}
        role="dialog"
        aria-modal="true"
      >
        <SaleDetailBody saleId={renderId} onClose={onClose} />
      </aside>
    </>
  )
}

function SaleDetailBody({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const qc = useQueryClient()
  const role = useSessionStore((s) => s.status.user?.role)
  const canVoid = ['OWNER', 'MANAGER'].includes((role ?? '').toUpperCase())
  const [printing, setPrinting] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [voidErr, setVoidErr] = useState<string | null>(null)

  const { data: sale, isPending } = useQuery({
    queryKey: ['sales', 'detail', saleId],
    queryFn: () => dataClient.sales.get(saleId),
    enabled: true,
  })
  const { data: customer } = useQuery({
    queryKey: ['contact-selfie', sale?.customerId],
    queryFn: () => dataClient.contacts.get(sale!.customerId!),
    enabled: !!sale?.customerId,
  })

  const flash = (msg: string) => {
    setNote(msg)
    window.setTimeout(() => setNote(null), 2400)
  }

  // NOTE: keep this hook above the early return below — it must run on every render.
  const voidM = useMutation({
    mutationFn: () => dataClient.sales.void(saleId, reason.trim()),
    onSuccess: () => {
      // Void reverses stock, deposits and debts too — refresh those views as well.
      void qc.invalidateQueries({ queryKey: ['sales'] })
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      void qc.invalidateQueries({ queryKey: queryKeys.inventory })
      void qc.invalidateQueries({ queryKey: queryKeys.contacts })
      void qc.invalidateQueries({ queryKey: ['deposits'] })
      setVoidOpen(false)
      setReason('')
      setVoidErr(null)
      flash(t('sales.voided'))
    },
    onError: (e) => setVoidErr(errorMessage(e, t('sales.voidFailed'))),
  })

  if (isPending || !sale) {
    return (
      <div className="drawer-b">
        <p className="hint">{t('sales.loading')}</p>
      </div>
    )
  }

  const st = saleStatusInfo(t, sale)
  const custName = sale.customerName ?? t('sales.walkIn')
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

  const isVoided = (sale.status ?? '').toUpperCase() === 'VOIDED'

  return (
    <>
      <div className="drawer-h">
        <div className="di">{I.receipt}</div>
        <div className="ti">
          <h3>{sale.saleNumber}</h3>
          <p>{formatSaleDateTime(sale.soldAt, lang)}</p>
        </div>
        <button type="button" className="x" onClick={onClose} aria-label={t('sales.close')}>
          {I.x}
        </button>
      </div>

      <div className="drawer-b">
        <div
          className="ramt"
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-.5px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {money.format(sale.totalAmount)}
        </div>
        <div
          className="rmeta"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            margin: '12px 0 18px',
            alignItems: 'center',
          }}
        >
          <span className={`st ${st.cls}`}>
            <span className="d" />
            {st.label}
          </span>
          <span className="chip-tag">{salePayLabel(t, sale.paymentMethod)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div className="avatar av-brand" style={{ width: 34, height: 34, fontSize: 12 }}>
            {customer?.selfieUrl ? <img src={customer.selfieUrl} alt="" /> : saleInitials(custName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{custName}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {sale.customerPhone ?? '—'}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: '4px 0 6px',
          }}
        >
          {t('sales.items')} · {sale.items.length}
        </div>
        {sale.items.map((it) => (
          <div key={it.id} className="receipt-line">
            <span className="q">{it.quantity}</span>
            <div className="nm">
              {it.productName}
              {it.variantName ? ` · ${it.variantName}` : ''}
              {it.serialNumber ? ` · ${it.serialNumber}` : ''}
              <div className="u">
                {money.format(it.unitPrice)} {t('sales.each') as string}
              </div>
            </div>
            <span className="lt">{money.format(it.lineTotal)}</span>
          </div>
        ))}

        <div
          className="receipt-tot"
          style={{ marginTop: 12, borderRadius: 13, border: '1px solid var(--border)' }}
        >
          <div className="tr">
            <span>{t('sales.subtotal')}</span>
            <span className="num">{money.format(sale.subtotal)}</span>
          </div>
          {sale.discountAmount > 0 ? (
            <div className="tr">
              <span>{t('sales.discount')}</span>
              <span className="num">− {money.format(sale.discountAmount)}</span>
            </div>
          ) : null}
          {sale.chargesAmount > 0 ? (
            <div className="tr">
              <span>{t('sales.charges')}</span>
              <span className="num">+ {money.format(sale.chargesAmount)}</span>
            </div>
          ) : null}
          {sale.creditAmount > 0 ? (
            <div className="tr">
              <span>{t('sales.credit')}</span>
              <span className="num">{money.format(sale.creditAmount)}</span>
            </div>
          ) : null}
          {sale.changeGiven > 0 ? (
            <div className="tr">
              <span>{t('sales.change')}</span>
              <span className="num">{money.format(sale.changeGiven)}</span>
            </div>
          ) : null}
          <div className="tr g">
            <span>{sale.creditAmount > 0 ? t('sales.totalDue') : t('sales.totalPaid')}</span>
            <span>{money.format(sale.creditAmount > 0 ? sale.totalAmount : sale.amountPaid)}</span>
          </div>
        </div>

        {canVoid && !isVoided ? (
          <button type="button" className="void-btn" onClick={() => setVoidOpen(true)}>
            {t('sales.voidSale')}
          </button>
        ) : null}

        {note ? (
          <div className="hint" style={{ textAlign: 'center', paddingTop: 10 }}>
            {note}
          </div>
        ) : null}
      </div>

      <div className="drawer-f">
        <button
          type="button"
          className="btn"
          disabled={printing}
          onClick={() => void print()}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          {I.print}
          {printing ? '…' : t('sales.print')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setSendOpen(true)}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          {I.send}
          {t('sales.sendReceipt')}
        </button>
      </div>

      {sendOpen ? (
        <ReceiptSendDialog
          sale={sale}
          customerName={custName}
          locale={lang}
          onClose={() => setSendOpen(false)}
        />
      ) : null}

      <Modal
        open={voidOpen}
        onClose={() => {
          if (voidM.isPending) return
          setVoidOpen(false)
          setVoidErr(null)
        }}
        title={t('sales.voidTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setVoidOpen(false)} disabled={voidM.isPending}>
              {t('sales.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={voidM.isPending}
              disabled={reason.trim().length < VOID_MIN_REASON}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => voidM.mutate()}
            >
              {t('sales.voidSale')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
          {t('sales.voidBody').replace('{number}', sale.saleNumber)}
        </p>
        <textarea
          className="void-reason"
          value={reason}
          placeholder={t('sales.voidReasonPh')}
          rows={3}
          maxLength={1000}
          onChange={(e) => {
            setReason(e.target.value)
            if (voidErr) setVoidErr(null)
          }}
        />
        <div className="void-hint">
          {reason.trim().length < VOID_MIN_REASON
            ? t('sales.voidReasonMin').replace('{n}', String(VOID_MIN_REASON))
            : ''}
        </div>
        {voidErr ? (
          <div className="msg err" style={{ marginTop: 8 }}>
            <span>{voidErr}</span>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
