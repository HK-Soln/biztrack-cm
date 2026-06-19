import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal } from '@biztrack/ui/biztrack'
import { renderPurchaseOrderHtml } from '@biztrack/templates'
import { PurchaseOrderStatus } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { ReceivePoModal } from '@/components/inventory/ReceivePoModal'
import { ActionMenu } from '@/components/ActionMenu'
import { ShareDialog } from '@/components/procurement/ShareDialog'

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'st-neutral', SENT: 'st-brand', CONFIRMED: 'st-brand', PARTIALLY_RECEIVED: 'st-low', RECEIVED: 'st-ok', CANCELLED: 'st-out',
}

export function PoDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { data: po, isPending } = useQuery({
    queryKey: [...queryKeys.purchaseOrders, id],
    queryFn: () => dataClient.purchaseOrders.get(id),
    enabled: isElectron && !!id,
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [...queryKeys.purchaseOrders, id] })
    void qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders })
  }

  const cancelM = useMutation({
    mutationFn: () => dataClient.purchaseOrders.cancel(id),
    onSuccess: () => { invalidate(); setErr(null) },
    onError: (e) => setErr(errorMessage(e, t('po.cancelError'))),
  })

  const preview = async () => {
    try {
      const doc = await dataClient.purchaseOrders.buildDocument(id)
      setPreviewHtml(renderPurchaseOrderHtml(doc))
    } catch (e) {
      setErr(errorMessage(e, t('po.previewError')))
    }
  }

  if (isPending) return <div className="frame"><div className="cat-empty">{t('po.loading')}</div></div>
  if (!po) return <div className="frame"><div className="cat-empty">{t('po.notFound')}</div></div>

  const canCancel = po.status !== PurchaseOrderStatus.RECEIVED && po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED && po.status !== PurchaseOrderStatus.CANCELLED
  const canReceive = po.status !== PurchaseOrderStatus.RECEIVED && po.status !== PurchaseOrderStatus.CANCELLED && po.status !== PurchaseOrderStatus.DRAFT

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/purchasing/orders')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('po.title')}
      </button>

      <div className="page-head">
        <div>
          <h1>{po.number} <span className={`st ${STATUS_CLASS[po.status] ?? 'st-neutral'}`}>{t(`po.status_${po.status}` as Parameters<typeof t>[0])}</span></h1>
          <p>{po.supplierName ?? '—'}{po.expectedDate ? ` · ${t('po.expectedShort')} ${new Date(po.expectedDate).toLocaleDateString()}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canReceive ? <Button variant="primary" onClick={() => setReceiving(true)}>{t('po.receive')}</Button> : null}
          <button type="button" className="icon-btn" title={t('po.preview')} aria-label={t('po.preview')} onClick={() => void preview()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
          <ActionMenu
            items={[
              { label: t('po.share'), onClick: () => setShareOpen(true) },
              ...(canCancel ? [{ label: t('po.cancelPo'), danger: true, onClick: () => cancelM.mutate() }] : []),
            ]}
          />
        </div>
      </div>

      {err ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }} role="alert">{err}</p> : null}

      <div className="card">
        <div className="card-h"><div><h3>{t('po.items')}</h3></div></div>
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('po.colItem')}</th>
              <th className="right">{t('po.colQty')}</th>
              <th className="right">{t('po.colReceivedQty')}</th>
              <th className="right">{t('po.colUnitPrice')}</th>
              <th className="right">{t('po.colLineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="right num">{it.quantity}</td>
                <td className="right num" style={{ color: it.receivedQuantity >= it.quantity ? 'var(--success)' : it.receivedQuantity > 0 ? 'var(--warning)' : 'var(--text-3)' }}>{it.receivedQuantity}</td>
                <td className="right num">{money.format(it.unitPrice)}</td>
                <td className="right num">{money.format(it.quantity * it.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals" style={{ marginLeft: 'auto', width: 260, marginTop: 8 }}>
          <div className="row grand" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{t('po.total')}</span><span>{money.format(po.totalAmount)}</span></div>
        </div>
        {po.messageBody ? <div className="note" style={{ marginTop: 12 }}>{po.messageBody}</div> : null}
      </div>

      <Modal open={!!previewHtml} onClose={() => setPreviewHtml(null)} title={t('po.previewTitle')} className="modal-lg">
        <iframe title="preview" srcDoc={previewHtml ?? ''} style={{ width: '100%', height: '60vh', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
      </Modal>
      {receiving ? <ReceivePoModal po={po} open onClose={() => setReceiving(false)} /> : null}
      {shareOpen ? (
        <ShareDialog kind="po" id={id} supplierName={po.supplierName} onClose={() => setShareOpen(false)} onSent={() => { invalidate(); setShareOpen(false) }} />
      ) : null}
    </div>
  )
}
