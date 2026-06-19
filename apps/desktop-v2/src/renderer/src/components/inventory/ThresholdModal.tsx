import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { LocalProduct } from '@shared/ipc'

const numOrNull = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : null)

/** Edit reorder / low-stock thresholds for a tracked product (no movement). */
export function ThresholdModal({ product, open, onClose }: { product: LocalProduct; open: boolean; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [low, setLow] = useState(product.lowStockThreshold != null ? String(product.lowStockThreshold) : '')
  const [reorder, setReorder] = useState(product.reorderPoint != null ? String(product.reorderPoint) : '')
  const [err, setErr] = useState<string | null>(null)

  const m = useMutation({
    mutationFn: () => dataClient.inventory.setThreshold(product.id, { lowStockThreshold: numOrNull(low), reorderPoint: numOrNull(reorder) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      onClose()
    },
    onError: (e) => setErr(errorMessage(e, t('inv.thresholdError'))),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('inv.thresholdTitle')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={m.isPending}>{t('inv.cancel')}</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>{t('inv.save')}</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('inv.thresholdSub')}</p>
      <div className="form-2col">
        <div className="ff">
          <label className="lbl2">{t('inv.lowStock')}</label>
          <Input value={low} inputMode="numeric" placeholder="0" onChange={(e) => setLow(e.target.value)} />
        </div>
        <div className="ff">
          <label className="lbl2">{t('inv.reorderPt')}</label>
          <Input value={reorder} inputMode="numeric" placeholder="0" onChange={(e) => setReorder(e.target.value)} />
        </div>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>{t('inv.thresholdHint')}</div>
      {err ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{err}</p> : null}
    </Modal>
  )
}
