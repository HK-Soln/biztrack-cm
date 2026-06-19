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
 * Reusable line-items picker for RFQ/PO forms. Adding is a searchable CommandSelect
 * (DB-backed, scales to many products). Added items collapse to a single "N items"
 * summary; clicking it opens a dialog to review/edit quantities (+ unit price) and
 * remove — so the form stays compact even with dozens of lines.
 */
export function ItemsField({
  value,
  onChange,
  withPrice,
  defaultCost,
}: {
  value: ItemLine[]
  onChange: (lines: ItemLine[]) => void
  withPrice?: boolean
  /** Optional (productId → cost) to prefill unit price on add. */
  defaultCost?: (productId: string) => string | undefined
}) {
  const t = useT()
  const money = useCurrency()
  const [open, setOpen] = useState(false)

  const loadOptions = useCallback(async (search: string) => {
    const res = await dataClient.products.list({ search: search || undefined, limit: 20 })
    return res.data.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku ?? undefined }))
  }, [])

  const add = (id: string | null, opt?: { label: string }) => {
    if (!id || value.some((l) => l.productId === id)) return
    onChange([...value, { productId: id, name: opt?.label ?? '', quantity: '1', unitPrice: withPrice ? (defaultCost?.(id) ?? '') : undefined }])
  }
  const patch = (id: string, p: Partial<ItemLine>) => onChange(value.map((l) => (l.productId === id ? { ...l, ...p } : l)))
  const remove = (id: string) => onChange(value.filter((l) => l.productId !== id))

  const total = value.reduce((s, l) => s + num(l.quantity) * num(l.unitPrice), 0)

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <CommandSelect
          value={null}
          onChange={(id, opt) => add(id, opt)}
          loadOptions={loadOptions}
          placeholder={t('field.addProduct')}
          searchPlaceholder={t('field.searchProducts')}
        />
      </div>
      <button type="button" className="count-chip" disabled={value.length === 0} onClick={() => setOpen(true)}>
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
