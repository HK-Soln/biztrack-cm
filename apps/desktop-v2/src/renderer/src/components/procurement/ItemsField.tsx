import { useCallback, useState } from 'react'
import { Button, CommandSelect, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'

export interface ItemLine {
  productId: string
  name: string
  quantity: string
  /** Present only when withPrice — the agreed/expected unit cost. */
  unitPrice?: string
}

const num = (s: string | undefined) => (s && s.trim() ? Number(s.replace(/\s/g, '')) : 0)

/**
 * Reusable line-items picker for RFQ/PO forms. A full inline row adds a product with its
 * quantity (+ unit price for POs) in one go via a DB-backed searchable CommandSelect.
 * Added items collapse to a "N items" summary chip that opens a dialog to review/edit/
 * remove — so the form stays compact even with dozens of lines.
 */
export function ItemsField({
  value,
  onChange,
  withPrice,
}: {
  value: ItemLine[]
  onChange: (lines: ItemLine[]) => void
  withPrice?: boolean
}) {
  const t = useT()
  const money = useCurrency()
  const [open, setOpen] = useState(false)

  // Draft (inline add) row.
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [draftQty, setDraftQty] = useState('1')
  const [draftPrice, setDraftPrice] = useState('')

  const loadOptions = useCallback(async (search: string) => {
    const res = await dataClient.products.list({ search: search || undefined, limit: 20 })
    return res.data.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku ?? undefined, imageUrl: p.imageUrl }))
  }, [])

  const pickProduct = (id: string | null, opt?: { label: string }) => {
    setDraftId(id)
    setDraftName(opt?.label ?? null)
    if (withPrice && id) {
      // Prefill the unit price with the product's cost as a starting point.
      void dataClient.products.get(id).then((p) => {
        if (p?.effectiveCostPrice != null) setDraftPrice(String(p.effectiveCostPrice))
      })
    }
  }

  const resetDraft = () => {
    setDraftId(null)
    setDraftName(null)
    setDraftQty('1')
    setDraftPrice('')
  }

  const addDraft = () => {
    if (!draftId || num(draftQty) <= 0) return
    const existing = value.find((l) => l.productId === draftId)
    if (existing) {
      // Same product picked again → merge quantities instead of duplicating.
      onChange(value.map((l) => (l.productId === draftId ? { ...l, quantity: String(num(l.quantity) + num(draftQty)), unitPrice: withPrice ? draftPrice || l.unitPrice : undefined } : l)))
    } else {
      onChange([...value, { productId: draftId, name: draftName ?? '', quantity: draftQty, unitPrice: withPrice ? draftPrice : undefined }])
    }
    resetDraft()
  }

  const patch = (id: string, p: Partial<ItemLine>) => onChange(value.map((l) => (l.productId === id ? { ...l, ...p } : l)))
  const remove = (id: string) => onChange(value.filter((l) => l.productId !== id))
  const total = value.reduce((s, l) => s + num(l.quantity) * num(l.unitPrice), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <CommandSelect
            value={draftId}
            valueLabel={draftName}
            onChange={(id, opt) => pickProduct(id, opt)}
            loadOptions={loadOptions}
            placeholder={t('field.addProduct')}
            searchPlaceholder={t('field.searchProducts')}
          />
        </div>
        <Input value={draftQty} inputMode="numeric" aria-label={t('field.colQty')} onChange={(e) => setDraftQty(e.target.value)} style={{ width: 80, textAlign: 'right' }} />
        {withPrice ? (
          <Input value={draftPrice} inputMode="decimal" placeholder={t('field.colUnitPrice')} aria-label={t('field.colUnitPrice')} onChange={(e) => setDraftPrice(e.target.value)} style={{ width: 120, textAlign: 'right' }} />
        ) : null}
        <Button variant="soft" onClick={addDraft} disabled={!draftId || num(draftQty) <= 0}>+ {t('field.add')}</Button>
      </div>

      <button type="button" className="count-chip" style={{ marginTop: 10 }} disabled={value.length === 0} onClick={() => setOpen(true)}>
        <span className="n">{value.length}</span>
        {t('field.itemsAdded')}
        {withPrice && value.length > 0 ? <span className="sub"> · {money.compact(total)}</span> : null}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t('field.itemsTitle')} className="modal-lg" footer={<Button variant="primary" onClick={() => setOpen(false)}>{t('field.done')}</Button>}>
        {value.length === 0 ? (
          <div className="hint" style={{ padding: 16, textAlign: 'center' }}>{t('field.noItems')}</div>
        ) : (
          <table className="ltbl">
            <thead>
              <tr>
                <th>{t('field.colItem')}</th>
                <th className="right" style={{ width: 90 }}>{t('field.colQty')}</th>
                {withPrice ? <th className="right" style={{ width: 120 }}>{t('field.colUnitPrice')}</th> : null}
                {withPrice ? <th className="right">{t('field.colLineTotal')}</th> : null}
                <th />
              </tr>
            </thead>
            <tbody>
              {value.map((l) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td className="right"><Input value={l.quantity} inputMode="numeric" onChange={(e) => patch(l.productId, { quantity: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td>
                  {withPrice ? <td className="right"><Input value={l.unitPrice ?? ''} inputMode="decimal" placeholder="0" onChange={(e) => patch(l.productId, { unitPrice: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td> : null}
                  {withPrice ? <td className="right num">{money.format(num(l.quantity) * num(l.unitPrice))}</td> : null}
                  <td className="right">
                    <button type="button" title={t('field.remove')} onClick={() => remove(l.productId)} style={{ color: 'var(--danger)', background: 'none', border: 0, cursor: 'pointer' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {withPrice && value.length > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontWeight: 700 }}>
            <span>{t('field.total')}</span><span>{money.format(total)}</span>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
