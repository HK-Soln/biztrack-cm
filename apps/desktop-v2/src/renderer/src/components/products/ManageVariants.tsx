import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { LocalProduct, LocalVariant, VariantInput } from '@shared/ipc'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : null)
const sigOf = (optionIds: string[]) => [...optionIds].sort().join('|')

/**
 * Manage a product's variants (movement-based). Add (opening stock → stock-in),
 * edit info (no movement), remove (write-off → stock-out, reason). Responsive:
 * table on desktop/tablet, cards on mobile.
 */
export function ManageVariants({ product }: { product: LocalProduct }) {
  const t = useT()
  const qc = useQueryClient()
  const bp = useBreakpoint()
  const money = useCurrency()
  const id = product.id

  const { data: variants = [] } = useQuery({
    queryKey: [...queryKeys.products, 'variants', id],
    queryFn: () => dataClient.products.listVariants(id),
    enabled: isElectron,
  })
  const { data: serials = [] } = useQuery({
    queryKey: [...queryKeys.products, 'serials', id],
    queryFn: () => dataClient.products.listSerialUnits(id),
    enabled: isElectron && product.isSerialized,
  })
  const { data: links = [] } = useQuery({
    queryKey: queryKeys.categoryAttributeLinks(product.categoryId ?? 'none'),
    queryFn: () => dataClient.attributes.listCategoryLinks(product.categoryId!),
    enabled: isElectron && !!product.categoryId,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.products })
  const variantStock = (v: LocalVariant) => (product.isSerialized ? serials.filter((s) => s.variantId === v.id).length : v.stockQuantity)

  const [sel, setSel] = useState<Record<string, string>>({})
  const [opening, setOpening] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)
  const [edit, setEdit] = useState<LocalVariant | null>(null)
  const [editFields, setEditFields] = useState({ name: '', price: '', cost: '', active: true })
  const [remove, setRemove] = useState<LocalVariant | null>(null)
  const [reason, setReason] = useState('')

  const addM = useMutation({
    mutationFn: (input: VariantInput) => dataClient.products.addVariant(id, input),
    onSuccess: () => {
      setSel({})
      setOpening('')
      setAddErr(null)
      invalidate()
    },
    onError: (e) => setAddErr(errorMessage(e, t('pvar.addError'))),
  })
  const updateM = useMutation({
    mutationFn: (input: { variantId: string; data: VariantInput }) => dataClient.products.updateVariant(id, input.variantId, input.data),
    onSuccess: () => {
      setEdit(null)
      invalidate()
    },
  })
  const removeM = useMutation({
    mutationFn: (input: { variantId: string; reason: string }) => dataClient.products.removeVariant(id, input.variantId, input.reason),
    onSuccess: () => {
      setRemove(null)
      setReason('')
      invalidate()
    },
  })

  const submitAdd = () => {
    if (links.some((g) => !sel[g.attributeGroupId])) return setAddErr(t('pvar.pickAll'))
    const options = links.map((g) => ({ attributeGroupId: g.attributeGroupId, attributeOptionId: sel[g.attributeGroupId]! }))
    // Pre-check against the loaded variants so we don't round-trip on a known duplicate.
    const sig = sigOf(options.map((o) => o.attributeOptionId))
    if (variants.some((v) => sigOf(v.options.map((o) => o.attributeOptionId)) === sig)) return setAddErr(t('pvar.dupCombo'))
    const name = links.map((g) => g.options.find((o) => o.id === sel[g.attributeGroupId])?.value ?? '?').join(' / ')
    addM.mutate({ name, openingStock: product.isSerialized ? 0 : num(opening) ?? 0, isActive: true, options })
  }
  const openEdit = (v: LocalVariant) => {
    setEdit(v)
    setEditFields({ name: v.name, price: v.priceOverride != null ? String(v.priceOverride) : '', cost: v.costPriceOverride != null ? String(v.costPriceOverride) : '', active: v.isActive })
  }
  const saveEdit = () => {
    if (!edit) return
    updateM.mutate({
      variantId: edit.id,
      data: { name: editFields.name.trim() || edit.name, priceOverride: num(editFields.price), costPriceOverride: num(editFields.cost), isActive: editFields.active, options: edit.options },
    })
  }

  const editIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M14 6l4 4" /></svg>
  const delIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>

  const actions = (v: LocalVariant) => (
    <span className="acts" style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end' }}>
      <button type="button" title={t('pvar.edit')} onClick={() => openEdit(v)}>{editIcon}</button>
      <button type="button" title={t('pvar.remove')} onClick={() => setRemove(v)} style={{ color: 'var(--danger)' }}>{delIcon}</button>
    </span>
  )
  const statusPill = (v: LocalVariant) =>
    v.isActive ? <span className="st st-ok"><span className="d" />{t('prod.active')}</span> : <span className="st st-neutral">{t('prod.inactive')}</span>

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-h">
        <div>
          <h3>{t('pvar.title')}</h3>
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{t('pvar.sub')}</p>
        </div>
        <span className="chip-tag">{variants.length}</span>
      </div>

      {/* Add variant. */}
      {!product.categoryId ? (
        <div className="form-note"><span>{t('pvar.needCategory')}</span></div>
      ) : links.length === 0 ? (
        <div className="form-note"><span>{t('pvar.noGroups')}</span></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            {links.map((g) => (
              <div key={g.id} style={{ flex: '1 1 140px', minWidth: 0 }}>
                <label className="lbl2">{g.name}</label>
                <Select value={sel[g.attributeGroupId] ?? ''} onChange={(e) => { setSel((p) => ({ ...p, [g.attributeGroupId]: e.target.value })); setAddErr(null) }}>
                  <option value="">{t('pvar.pick')}</option>
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>{o.value}</option>
                  ))}
                </Select>
              </div>
            ))}
            {!product.isSerialized ? (
              <div style={{ flex: '0 1 120px' }}>
                <label className="lbl2">{t('pvar.opening')}</label>
                <Input value={opening} inputMode="numeric" placeholder="0" onChange={(e) => setOpening(e.target.value)} />
              </div>
            ) : null}
            <Button variant="primary" onClick={submitAdd} loading={addM.isPending}>+ {t('pvar.add')}</Button>
          </div>
          {addErr ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: -4, marginBottom: 10 }} role="alert">{addErr}</p> : null}
          {product.isSerialized ? <div className="hint" style={{ marginBottom: 10 }}>{t('pvar.serializedNote')}</div> : null}
        </>
      )}

      {variants.length === 0 ? (
        <div className="hint">{t('pvar.empty')}</div>
      ) : bp === 'mobile' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {variants.map((v) => (
            <div key={v.id} className="card" style={{ background: 'var(--inset)', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="nm">{v.name}</span>
                {statusPill(v)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
                <span>{money.format(v.priceOverride ?? product.sellingPrice)} · {t('pvar.stockN').replace('{n}', String(variantStock(v)))}</span>
                {actions(v)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('pvar.colVariant')}</th>
              <th className="right">{t('pvar.colPrice')}</th>
              <th className="right">{t('pvar.colStock')}</th>
              <th>{t('prod.colStatus')}</th>
              <th className="right">{t('pvar.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id}>
                <td><span className="nm">{v.name}</span></td>
                <td className="right num">{money.format(v.priceOverride ?? product.sellingPrice)}</td>
                <td className="right num">{variantStock(v)}</td>
                <td>{statusPill(v)}</td>
                <td className="right">{actions(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Edit info modal. */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={t('pvar.editTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setEdit(null)} disabled={updateM.isPending}>{t('pvar.cancel')}</Button>
            <Button variant="primary" loading={updateM.isPending} onClick={saveEdit}>{t('pvar.save')}</Button>
          </>
        }
      >
        <div className="ff"><label className="lbl2">{t('pvar.name')}</label><Input value={editFields.name} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} /></div>
        <div className="form-2col" style={{ marginTop: 10 }}>
          <div className="ff"><label className="lbl2">{t('pvar.price')}</label><Input value={editFields.price} inputMode="decimal" placeholder={String(product.sellingPrice)} onChange={(e) => setEditFields((f) => ({ ...f, price: e.target.value }))} /></div>
          <div className="ff"><label className="lbl2">{t('pvar.cost')}</label><Input value={editFields.cost} inputMode="decimal" placeholder="0" onChange={(e) => setEditFields((f) => ({ ...f, cost: e.target.value }))} /></div>
        </div>
        <button type="button" className={`switch-line${editFields.active ? ' on' : ''}`} style={{ marginTop: 12 }} onClick={() => setEditFields((f) => ({ ...f, active: !f.active }))} aria-pressed={editFields.active}>
          <span className={`switch${editFields.active ? ' on' : ''}`} />
          <span>{t('pvar.active')}</span>
        </button>
      </Modal>

      {/* Remove (write-off) modal. */}
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title={t('pvar.removeTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setRemove(null)} disabled={removeM.isPending}>{t('pvar.cancel')}</Button>
            <Button variant="primary" loading={removeM.isPending} disabled={reason.trim().length < 3} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => remove && removeM.mutate({ variantId: remove.id, reason: reason.trim() })}>
              {t('pvar.remove')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
          {t('pvar.removeBody').replace('{name}', remove?.name ?? '').replace('{n}', String(remove ? variantStock(remove) : 0))}
        </p>
        <label className="lbl2">{t('pvar.reason')}</label>
        <Input value={reason} placeholder={t('pvar.reasonPh')} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  )
}
