import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import type { LocalPurchaseOrderDetail, LocalProduct, RestockItemInput } from '@shared/ipc'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)
const splitSerials = (s: string) => s.split(/[\n,;\s]+/).map((x) => x.trim()).filter(Boolean)

interface LineState {
  qty: string
  cost: string
  serials: string
}

/**
 * Receive goods against a purchase order: lines auto-fill from the PO (remaining
 * quantity + agreed unit price). Edit the delivered quantity/cost, paste/scan serial
 * numbers for serialized products, and optionally pay partially (the rest becomes a
 * supplier payable). Submitting records a restock that fulfils the PO.
 */
export function ReceivePoModal({ po, open, onClose }: { po: LocalPurchaseOrderDetail; open: boolean; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const money = useCurrency()

  // Load each line's product to know how to receive it (serialized vs qty).
  const { data: productMap } = useQuery({
    queryKey: [...queryKeys.purchaseOrders, po.id, 'products'],
    queryFn: async () => {
      const ids = [...new Set(po.items.map((i) => i.productId))]
      const products = await Promise.all(ids.map((id) => dataClient.products.get(id)))
      const map: Record<string, LocalProduct> = {}
      for (const p of products) if (p) map[p.id] = p
      return map
    },
    enabled: isElectron && open,
  })

  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      po.items.map((it) => [
        it.id,
        { qty: String(Math.max(0, it.quantity - it.receivedQuantity)), cost: String(it.unitPrice), serials: '' },
      ]),
    ),
  )
  const [amountPaid, setAmountPaid] = useState('')
  const [reference, setReference] = useState(po.number)
  const [err, setErr] = useState<string | null>(null)

  const patch = (id: string, p: Partial<LineState>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id]!, ...p } }))
  const isSerial = (productId: string) => productMap?.[productId]?.isSerialized ?? false

  const built = useMemo(() => {
    const items: RestockItemInput[] = []
    let total = 0
    for (const it of po.items) {
      const ls = lines[it.id]!
      const cost = ls.cost.trim() ? num(ls.cost) : null
      if (isSerial(it.productId)) {
        const serials = splitSerials(ls.serials)
        if (serials.length === 0) continue
        items.push({ productId: it.productId, variantId: it.variantId, serialNumbers: serials, unitCost: cost })
        total += serials.length * (cost ?? 0)
      } else {
        const qty = num(ls.qty)
        if (qty <= 0) continue
        items.push({ productId: it.productId, variantId: it.variantId, quantity: qty, unitCost: cost })
        total += qty * (cost ?? 0)
      }
    }
    return { items, total }
  }, [lines, po.items, productMap])

  const paid = amountPaid.trim() ? num(amountPaid) : built.total
  const credit = Math.max(0, built.total - paid)

  const m = useMutation({
    mutationFn: () =>
      dataClient.inventory.restock({
        purchaseOrderId: po.id,
        supplierId: po.supplierId,
        amountPaid: amountPaid.trim() ? paid : null,
        reference: reference.trim() || null,
        items: built.items,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      void qc.invalidateQueries({ queryKey: queryKeys.inventory })
      void qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders })
      void qc.invalidateQueries({ queryKey: [...queryKeys.purchaseOrders, po.id] })
      onClose()
    },
    onError: (e) => setErr(errorMessage(e, t('recv.error'))),
  })

  const submit = () => {
    if (built.items.length === 0) return setErr(t('recv.nothing'))
    setErr(null)
    m.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('recv.title').replace('{number}', po.number)}
      className="modal-lg"
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={m.isPending}>{t('recv.cancel')}</Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>{t('recv.confirm').replace('{v}', money.format(built.total))}</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('recv.sub')}</p>
      <table className="ltbl">
        <thead>
          <tr>
            <th>{t('recv.colItem')}</th>
            <th className="right">{t('recv.colOrdered')}</th>
            <th className="right" style={{ width: 200 }}>{t('recv.colReceiving')}</th>
            <th className="right" style={{ width: 110 }}>{t('recv.colUnitCost')}</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((it) => {
            const ls = lines[it.id]!
            const remaining = Math.max(0, it.quantity - it.receivedQuantity)
            return (
              <tr key={it.id}>
                <td>
                  <div className="nm">{it.description}</div>
                  <div className="sub">{t('recv.received').replace('{r}', String(it.receivedQuantity)).replace('{q}', String(it.quantity))}</div>
                </td>
                <td className="right num">{remaining}</td>
                <td className="right">
                  {isSerial(it.productId) ? (
                    <textarea
                      className="ta"
                      rows={2}
                      value={ls.serials}
                      placeholder={t('recv.serialsPh')}
                      onChange={(e) => { patch(it.id, { serials: e.target.value }); setErr(null) }}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}
                    />
                  ) : (
                    <Input value={ls.qty} inputMode="numeric" onChange={(e) => { patch(it.id, { qty: e.target.value }); setErr(null) }} style={{ height: 32, textAlign: 'right' }} />
                  )}
                </td>
                <td className="right"><Input value={ls.cost} inputMode="decimal" onChange={(e) => patch(it.id, { cost: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="form-2col" style={{ marginTop: 12 }}>
        <div className="ff">
          <label className="lbl2">{t('recv.reference')}</label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="ff">
          <label className="lbl2">{t('recv.amountPaid')}</label>
          <Input value={amountPaid} inputMode="decimal" placeholder={money.format(built.total)} onChange={(e) => { setAmountPaid(e.target.value); setErr(null) }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13 }}>
        <span style={{ color: 'var(--text-2)' }}>{t('recv.total')}</span>
        <span style={{ fontWeight: 700 }}>{money.format(built.total)}</span>
      </div>
      {credit > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13, color: 'var(--danger)' }}>
          <span>{t('recv.credit')}</span>
          <span style={{ fontWeight: 700 }}>{money.format(credit)}</span>
        </div>
      ) : null}
      {credit > 0 ? <div className="hint" style={{ marginTop: 6 }}>{t('recv.creditNote')}</div> : null}
      {err ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{err}</p> : null}
    </Modal>
  )
}
