import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import type { LocalReorderSuggestion } from '@shared/ipc'

interface Line {
  productId: string
  name: string
  qty: string
  cost: string
  include: boolean
}
const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)

/**
 * "Generate PO" — a cash restock auto-filled from the products that need
 * reordering (direct, low/out). Each line is editable; supplier/credit deferred
 * (issue #83), so it's recorded as fully paid.
 */
export function GeneratePOModal({ suggestions, open, onClose }: { suggestions: LocalReorderSuggestion[]; open: boolean; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const money = useCurrency()
  const [lines, setLines] = useState<Line[]>([])
  const [reference, setReference] = useState('')
  const [err, setErr] = useState<string | null>(null)

  // Seed the lines from the suggestions whenever the modal opens.
  useEffect(() => {
    if (open) {
      setLines(suggestions.map((s) => ({ productId: s.productId, name: s.name, qty: String(s.suggestedQty), cost: s.unitCost != null ? String(s.unitCost) : '', include: true })))
      setReference('')
      setErr(null)
    }
  }, [open, suggestions])

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, ...patch } : l)))
  const active = lines.filter((l) => l.include && num(l.qty) > 0)
  const total = active.reduce((s, l) => s + num(l.qty) * num(l.cost), 0)

  const m = useMutation({
    mutationFn: () =>
      dataClient.inventory.restock({
        items: active.map((l) => ({ productId: l.productId, quantity: num(l.qty), unitCost: l.cost.trim() ? num(l.cost) : null })),
        reference: reference.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      void qc.invalidateQueries({ queryKey: queryKeys.inventory })
      onClose()
    },
    onError: (e) => setErr(errorMessage(e, t('inv.restockError'))),
  })

  const submit = () => {
    if (active.length === 0) return setErr(t('inv.poEmpty'))
    m.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('inv.poTitle')}
      className="modal-lg"
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={m.isPending}>{t('inv.cancel')}</Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>{t('inv.poConfirm').replace('{v}', money.format(total))}</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('inv.poSub')}</p>
      {lines.length === 0 ? (
        <div className="hint" style={{ padding: 16, textAlign: 'center' }}>{t('inv.poNone')}</div>
      ) : (
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('inv.colProduct')}</th>
              <th className="right">{t('inv.poInStock')}</th>
              <th className="right" style={{ width: 90 }}>{t('inv.restockQty')}</th>
              <th className="right" style={{ width: 110 }}>{t('inv.unitCost')}</th>
              <th className="right">{t('inv.restockTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const s = suggestions.find((x) => x.productId === l.productId)
              return (
                <tr key={l.productId} style={l.include ? undefined : { opacity: 0.45 }}>
                  <td>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={l.include} onChange={(e) => update(l.productId, { include: e.target.checked })} />
                      <span className="nm">{l.name}</span>
                    </label>
                  </td>
                  <td className="right num">{s?.currentStock ?? 0}</td>
                  <td className="right"><Input value={l.qty} inputMode="numeric" onChange={(e) => update(l.productId, { qty: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td>
                  <td className="right"><Input value={l.cost} inputMode="decimal" placeholder="0" onChange={(e) => update(l.productId, { cost: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td>
                  <td className="right num">{money.format(num(l.qty) * num(l.cost))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="ff" style={{ marginTop: 12 }}>
        <label className="lbl2">{t('inv.restockRef')}</label>
        <Input value={reference} placeholder={t('inv.restockRefPh')} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div className="hint" style={{ marginTop: 8 }}>{t('inv.restockCashNote')}</div>
      {err ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{err}</p> : null}
    </Modal>
  )
}
