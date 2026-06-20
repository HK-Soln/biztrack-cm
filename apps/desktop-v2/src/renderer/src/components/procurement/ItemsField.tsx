import { useCallback, useState } from 'react'
import { Button, CommandSelect, Input, Modal, Select } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import type { LocalVariant } from '@shared/ipc'

export interface ItemLine {
  productId: string
  /** Set when the product has variants — the line targets one specific variant. */
  variantId?: string | null
  name: string
  quantity: string
  /** Present only when withPrice — the agreed/expected unit cost. */
  unitPrice?: string
}

const lineKey = (productId: string, variantId?: string | null) => `${productId}::${variantId ?? ''}`

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
  const [draftVariants, setDraftVariants] = useState<LocalVariant[]>([])
  const [draftVariantId, setDraftVariantId] = useState('')
  const [draftQty, setDraftQty] = useState('1')
  const [draftPrice, setDraftPrice] = useState('')

  const loadOptions = useCallback(async (search: string) => {
    const res = await dataClient.products.list({ search: search || undefined, limit: 20 })
    return res.data.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku ?? undefined, imageUrl: p.imageUrl }))
  }, [])

  const pickProduct = (id: string | null, opt?: { label: string }) => {
    setDraftId(id)
    setDraftName(opt?.label ?? null)
    setDraftVariants([])
    setDraftVariantId('')
    if (!id) return
    // Load variants so the user can target one; prefill the unit price from cost.
    void dataClient.products.listVariants(id).then(setDraftVariants)
    if (withPrice) {
      void dataClient.products.get(id).then((p) => {
        if (p?.effectiveCostPrice != null) setDraftPrice(String(p.effectiveCostPrice))
      })
    }
  }

  const resetDraft = () => {
    setDraftId(null)
    setDraftName(null)
    setDraftVariants([])
    setDraftVariantId('')
    setDraftQty('1')
    setDraftPrice('')
  }

  const hasVariants = draftVariants.length > 0
  const canAdd = !!draftId && num(draftQty) > 0 && (!hasVariants || !!draftVariantId)

  const addDraft = () => {
    if (!canAdd || !draftId) return
    const variantId = hasVariants ? draftVariantId : null
    const variantName = variantId ? draftVariants.find((v) => v.id === variantId)?.name : null
    const name = variantName ? `${draftName ?? ''} · ${variantName}` : draftName ?? ''
    const key = lineKey(draftId, variantId)
    const existing = value.find((l) => lineKey(l.productId, l.variantId) === key)
    if (existing) {
      // Same product+variant picked again → merge quantities instead of duplicating.
      onChange(value.map((l) => (lineKey(l.productId, l.variantId) === key ? { ...l, quantity: String(num(l.quantity) + num(draftQty)), unitPrice: withPrice ? draftPrice || l.unitPrice : undefined } : l)))
    } else {
      onChange([...value, { productId: draftId, variantId, name, quantity: draftQty, unitPrice: withPrice ? draftPrice : undefined }])
    }
    resetDraft()
  }

  const patch = (key: string, p: Partial<ItemLine>) => onChange(value.map((l) => (lineKey(l.productId, l.variantId) === key ? { ...l, ...p } : l)))
  const remove = (key: string) => onChange(value.filter((l) => lineKey(l.productId, l.variantId) !== key))
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
        {hasVariants ? (
          <div style={{ flex: '0 1 180px' }}>
            <Select value={draftVariantId} onChange={(e) => setDraftVariantId(e.target.value)}>
              <option value="">{t('field.pickVariant')}</option>
              {draftVariants.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </div>
        ) : null}
        <Input value={draftQty} inputMode="numeric" aria-label={t('field.colQty')} onChange={(e) => setDraftQty(e.target.value)} style={{ width: 80, textAlign: 'right' }} />
        {withPrice ? (
          <Input value={draftPrice} inputMode="decimal" placeholder={t('field.colUnitPrice')} aria-label={t('field.colUnitPrice')} onChange={(e) => setDraftPrice(e.target.value)} style={{ width: 120, textAlign: 'right' }} />
        ) : null}
        <Button variant="soft" onClick={addDraft} disabled={!canAdd}>+ {t('field.add')}</Button>
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
                <tr key={lineKey(l.productId, l.variantId)}>
                  <td>{l.name}</td>
                  <td className="right"><Input value={l.quantity} inputMode="numeric" onChange={(e) => patch(lineKey(l.productId, l.variantId), { quantity: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td>
                  {withPrice ? <td className="right"><Input value={l.unitPrice ?? ''} inputMode="decimal" placeholder="0" onChange={(e) => patch(lineKey(l.productId, l.variantId), { unitPrice: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td> : null}
                  {withPrice ? <td className="right num">{money.format(num(l.quantity) * num(l.unitPrice))}</td> : null}
                  <td className="right">
                    <button type="button" title={t('field.remove')} onClick={() => remove(lineKey(l.productId, l.variantId))} style={{ color: 'var(--danger)', background: 'none', border: 0, cursor: 'pointer' }}>
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
