import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import type { LocalProduct } from '@shared/ipc'

type RestockKind = 'direct' | 'serialized' | 'variant'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)

/** Restock (cash/cost) for a direct product. Serialized/variant show guidance. */
export function RestockModal({ product, kind, open, onClose }: { product: LocalProduct; kind: RestockKind; open: boolean; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const money = useCurrency()
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState(product.costPrice != null ? String(product.costPrice) : '')
  const [reference, setReference] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const quantity = num(qty)
  const unitCost = cost.trim() ? num(cost) : null
  const totalCost = quantity * (unitCost ?? 0)

  const m = useMutation({
    mutationFn: () => dataClient.inventory.restock({ items: [{ productId: product.id, quantity, unitCost }], reference: reference.trim() || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      void qc.invalidateQueries({ queryKey: queryKeys.inventory })
      onClose()
    },
    onError: (e) => setErr(errorMessage(e, t('inv.restockError'))),
  })

  const submit = () => {
    if (quantity <= 0) return setErr(t('inv.qtyPositive'))
    m.mutate()
  }

  const ineligible = kind !== 'direct'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('inv.restockTitle')}
      footer={
        ineligible ? (
          <Button variant="primary" onClick={onClose}>{t('inv.gotIt')}</Button>
        ) : (
          <>
            <Button variant="soft" onClick={onClose} disabled={m.isPending}>{t('inv.cancel')}</Button>
            <Button variant="primary" loading={m.isPending} onClick={submit}>{t('inv.restock')}</Button>
          </>
        )
      }
    >
      {kind === 'serialized' ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{t('inv.restockSerialNote')}</p>
      ) : kind === 'variant' ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{t('inv.restockVariantNote')}</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('inv.restockSub').replace('{name}', product.name)}</p>
          <div className="form-2col">
            <div className="ff">
              <label className="lbl2">{t('inv.restockQty')}</label>
              <Input value={qty} inputMode="numeric" placeholder="0" onChange={(e) => { setQty(e.target.value); setErr(null) }} />
            </div>
            <div className="ff">
              <label className="lbl2">{t('inv.unitCost')}</label>
              <Input value={cost} inputMode="decimal" placeholder="0" onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          <div className="ff" style={{ marginTop: 10 }}>
            <label className="lbl2">{t('inv.restockRef')}</label>
            <Input value={reference} placeholder={t('inv.restockRefPh')} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="calc-row" style={{ marginTop: 12 }}>
            <span>{t('inv.restockTotal')}</span>
            <span className="big">{money.format(totalCost)}</span>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>{t('inv.restockCashNote')}</div>
          {err ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{err}</p> : null}
        </>
      )}
    </Modal>
  )
}
