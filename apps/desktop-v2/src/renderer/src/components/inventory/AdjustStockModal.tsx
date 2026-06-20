import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { LocalProduct, StockAdjustmentType } from '@shared/ipc'

const TYPES: StockAdjustmentType[] = ['ADD', 'REMOVE', 'SET']

/** Adjust a direct product's stock (set/add/remove + reason → MANUAL_ADJUSTMENT). */
export function AdjustStockModal({ product, open, onClose }: { product: LocalProduct; open: boolean; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [type, setType] = useState<StockAdjustmentType>('ADD')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const quantity = Number(qty.replace(/\s/g, '')) || 0
  const resulting = type === 'ADD' ? product.currentStock + quantity : type === 'REMOVE' ? product.currentStock - quantity : quantity

  const reset = () => {
    setType('ADD')
    setQty('')
    setReason('')
    setErr(null)
  }
  const m = useMutation({
    mutationFn: () => dataClient.inventory.adjust(product.id, { type, quantity, notes: reason.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      reset()
      onClose()
    },
    onError: (e) => setErr(errorMessage(e, t('inv.adjustError'))),
  })

  const submit = () => {
    if ((type === 'ADD' || type === 'REMOVE') && quantity <= 0) return setErr(t('inv.qtyPositive'))
    if (type === 'SET' && quantity < 0) return setErr(t('inv.qtyNonNeg'))
    if (resulting < 0) return setErr(t('inv.insufficient'))
    if (reason.trim().length < 3) return setErr(t('inv.reasonRequired'))
    m.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('inv.adjustTitle')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={m.isPending}>{t('inv.cancel')}</Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>{t('inv.apply')}</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
        {t('inv.adjustSub').replace('{name}', product.name)}
      </p>
      <label className="lbl2">{t('inv.adjustType')}</label>
      <div className="seg-pick" style={{ marginBottom: 12 }}>
        {TYPES.map((tp) => (
          <button key={tp} type="button" aria-pressed={tp === type} onClick={() => { setType(tp); setErr(null) }}>
            {t(`inv.type_${tp}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>
      <div className="form-2col">
        <div className="ff">
          <label className="lbl2">{type === 'SET' ? t('inv.newQty') : t('inv.quantity')}</label>
          <Input value={qty} inputMode="numeric" placeholder="0" onChange={(e) => { setQty(e.target.value); setErr(null) }} />
        </div>
        <div className="ff">
          <label className="lbl2">{t('inv.resulting')}</label>
          <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--inset)', fontWeight: 600 }}>
            {resulting}
          </div>
        </div>
      </div>
      <div className="ff" style={{ marginTop: 10 }}>
        <label className="lbl2">{t('inv.reason')}</label>
        <Input value={reason} placeholder={t('inv.reasonPh')} onChange={(e) => { setReason(e.target.value); setErr(null) }} />
      </div>
      {err ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{err}</p> : null}
    </Modal>
  )
}
