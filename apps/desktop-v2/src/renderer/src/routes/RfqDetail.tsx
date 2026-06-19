import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { renderRfqHtml } from '@biztrack/templates'
import { RfqSupplierStatus } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { ActionMenu } from '@/components/ActionMenu'
import { ShareDialog } from '@/components/procurement/ShareDialog'
import type { LocalRfqItem, LocalRfqSupplier } from '@shared/ipc'

const RFQ_STATUS_CLASS: Record<string, string> = {
  DRAFT: 'st-neutral', SENT: 'st-brand', QUOTED: 'st-low', CONVERTED: 'st-ok', CLOSED: 'st-neutral', CANCELLED: 'st-out',
}
const SUP_STATUS_CLASS: Record<string, string> = {
  PENDING: 'st-neutral', SENT: 'st-brand', QUOTED: 'st-low', DECLINED: 'st-out',
}

export function RfqDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [quoteTarget, setQuoteTarget] = useState<LocalRfqSupplier | null>(null)
  const [convertTarget, setConvertTarget] = useState<LocalRfqSupplier | null>(null)
  const [shareTarget, setShareTarget] = useState<LocalRfqSupplier | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [sendErr, setSendErr] = useState<string | null>(null)

  const { data: rfq, isPending } = useQuery({
    queryKey: [...queryKeys.rfqs, id],
    queryFn: () => dataClient.rfqs.get(id),
    enabled: isElectron && !!id,
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [...queryKeys.rfqs, id] })
    void qc.invalidateQueries({ queryKey: queryKeys.rfqs })
  }

  const preview = async (supplierId: string) => {
    try {
      const doc = await dataClient.rfqs.buildDocument(id, supplierId)
      setPreviewHtml(renderRfqHtml(doc))
    } catch (e) {
      setSendErr(errorMessage(e, t('rfq.previewError')))
    }
  }

  if (isPending) return <div className="frame"><div className="cat-empty">{t('rfq.loading')}</div></div>
  if (!rfq) return <div className="frame"><div className="cat-empty">{t('rfq.notFound')}</div></div>

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/purchasing/rfqs')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('rfq.title')}
      </button>

      <div className="page-head">
        <div>
          <h1>{rfq.number} <span className={`st ${RFQ_STATUS_CLASS[rfq.status] ?? 'st-neutral'}`}>{t(`rfq.status_${rfq.status}` as Parameters<typeof t>[0])}</span></h1>
          <p>{rfq.title || t('rfq.untitled')}</p>
        </div>
      </div>

      {sendErr ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }} role="alert">{sendErr}</p> : null}

      <div className="card">
        <div className="card-h"><div><h3>{t('rfq.items')}</h3></div></div>
        <table className="ltbl">
          <thead><tr><th>{t('rfq.colItem')}</th><th className="right">{t('rfq.colQty')}</th></tr></thead>
          <tbody>
            {rfq.items.map((it) => (
              <tr key={it.id}><td>{it.description}</td><td className="right num">{it.quantity}</td></tr>
            ))}
          </tbody>
        </table>
        {rfq.messageBody ? <div className="note" style={{ marginTop: 12 }}>{rfq.messageBody}</div> : null}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('rfq.suppliers')}</h3></div></div>
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('rfq.colSupplier')}</th>
              <th>{t('rfq.colSupplierStatus')}</th>
              <th className="right">{t('rfq.colQuote')}</th>
              <th className="right">{t('rfq.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rfq.suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.supplierName ?? '—'}</td>
                <td><span className={`st ${SUP_STATUS_CLASS[s.status] ?? 'st-neutral'}`}>{t(`rfq.supStatus_${s.status}` as Parameters<typeof t>[0])}</span></td>
                <td className="right num">{s.quotedTotal != null ? money.format(s.quotedTotal) : '—'}</td>
                <td className="right">
                  <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                    <button type="button" className="icon-btn" title={t('rfq.preview')} aria-label={t('rfq.preview')} onClick={() => void preview(s.supplierId)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                    <ActionMenu
                      items={[
                        { label: t('rfq.share'), onClick: () => setShareTarget(s) },
                        s.status !== RfqSupplierStatus.QUOTED
                          ? { label: t('rfq.recordQuote'), onClick: () => setQuoteTarget(s) }
                          : { label: t('rfq.convert'), onClick: () => setConvertTarget(s) },
                      ]}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {quoteTarget ? (
        <QuoteModal rfqId={id} supplier={quoteTarget} onClose={() => setQuoteTarget(null)} onSaved={() => { invalidate(); setQuoteTarget(null) }} />
      ) : null}
      {convertTarget ? (
        <ConvertModal
          rfqId={id}
          supplier={convertTarget}
          items={rfq.items}
          onClose={() => setConvertTarget(null)}
          onConverted={(poId) => { invalidate(); setConvertTarget(null); navigate(`/purchasing/orders/${poId}`) }}
        />
      ) : null}

      <Modal open={!!previewHtml} onClose={() => setPreviewHtml(null)} title={t('rfq.previewTitle')} className="modal-lg">
        <iframe title="preview" srcDoc={previewHtml ?? ''} style={{ width: '100%', height: '60vh', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
      </Modal>
      {shareTarget ? (
        <ShareDialog
          kind="rfq"
          id={id}
          supplierId={shareTarget.supplierId}
          supplierName={shareTarget.supplierName}
          onClose={() => setShareTarget(null)}
          onSent={() => { invalidate(); setShareTarget(null) }}
        />
      ) : null}
    </div>
  )
}

function QuoteModal({ rfqId, supplier, onClose, onSaved }: { rfqId: string; supplier: LocalRfqSupplier; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const [amount, setAmount] = useState(supplier.quotedTotal != null ? String(supplier.quotedTotal) : '')
  const [notes, setNotes] = useState(supplier.quoteNotes ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => dataClient.rfqs.recordQuote(rfqId, { rfqSupplierId: supplier.id, quotedTotal: Number(amount.replace(/\s/g, '')), quoteNotes: notes.trim() || undefined }),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('rfq.quoteError'))),
  })

  const submit = () => {
    const v = Number(amount.replace(/\s/g, ''))
    if (!Number.isFinite(v) || v < 0) return setError(t('rfq.quoteInvalid'))
    setError(null)
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('rfq.recordQuote')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={save.isPending}>{t('rfq.cancel')}</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>{t('rfq.saveQuote')}</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('rfq.quoteFor').replace('{name}', supplier.supplierName ?? '')}</p>
      <div className="ff" style={{ marginBottom: 12 }}>
        <label className="lbl2">{t('rfq.quoteTotal')}</label>
        <Input value={amount} inputMode="decimal" onChange={(e) => { setAmount(e.target.value); setError(null) }} />
      </div>
      <div className="ff">
        <label className="lbl2">{t('rfq.quoteNotes')}</label>
        <textarea className="ta" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
      </div>
      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
    </Modal>
  )
}

function ConvertModal({
  rfqId,
  supplier,
  items,
  onClose,
  onConverted,
}: {
  rfqId: string
  supplier: LocalRfqSupplier
  items: LocalRfqItem[]
  onClose: () => void
  onConverted: (poId: string) => void
}) {
  const t = useT()
  const money = useCurrency()
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [expected, setExpected] = useState('')
  const [error, setError] = useState<string | null>(null)
  const num = (s: string) => (s?.trim() ? Number(s.replace(/\s/g, '')) : 0)
  const total = items.reduce((s, it) => s + it.quantity * num(prices[it.id] ?? ''), 0)

  const save = useMutation({
    mutationFn: () =>
      dataClient.purchaseOrders.createFromRfq(rfqId, {
        rfqSupplierId: supplier.id,
        unitPrices: Object.fromEntries(items.map((it) => [it.id, num(prices[it.id] ?? '')])),
        expectedDate: expected || undefined,
      }),
    onSuccess: (po) => onConverted(po.id),
    onError: (e) => setError(errorMessage(e, t('rfq.convertError'))),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={t('rfq.convertTitle')}
      className="modal-lg"
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={save.isPending}>{t('rfq.cancel')}</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{t('rfq.convertConfirm')}</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('rfq.convertSub').replace('{name}', supplier.supplierName ?? '')}</p>
      <table className="ltbl">
        <thead><tr><th>{t('rfq.colItem')}</th><th className="right">{t('rfq.colQty')}</th><th className="right" style={{ width: 130 }}>{t('rfq.unitPrice')}</th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.description}</td>
              <td className="right num">{it.quantity}</td>
              <td className="right"><Input value={prices[it.id] ?? ''} inputMode="decimal" placeholder="0" onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value }))} style={{ height: 32, textAlign: 'right' }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8 }}><span>{t('rfq.poTotal')}</span><span>{money.format(total)}</span></div>
      <div className="ff" style={{ marginTop: 12, maxWidth: 220 }}>
        <label className="lbl2">{t('rfq.expected')}</label>
        <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
      </div>
      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
    </Modal>
  )
}
