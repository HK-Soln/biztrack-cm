import { useState } from 'react'
import { Button, Input, ScanInput, Select } from '@biztrack/ui/biztrack'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { validateSerial } from '@/lib/serial'
import type { LocalPurchaseOrderItem, LocalProduct, LocalVariant, SerialType } from '@shared/ipc'

/** One receive group: a (variant) bucket of either a quantity or a set of serials. */
export interface RecvGroup {
  key: string
  variantId: string | null
  qty: string
  serials: string[]
  cost: string
}

export const newGroup = (variantId: string | null, cost: string): RecvGroup => ({
  key: crypto.randomUUID(),
  variantId,
  qty: '',
  serials: [],
  cost,
})

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)
const splitSerials = (s: string) => s.split(/[\n,;\s]+/).map((x) => x.trim()).filter(Boolean)

/**
 * Receive entry for a single PO line. Adapts to the product kind:
 *  - direct / variant-specific line → one quantity (+ cost) bucket
 *  - serialized → scan/paste serial numbers (validated chips)
 *  - variant product on a product-level line → one bucket per variant the user adds
 *    (quantities, or serials per variant for serialized variants)
 * Controlled: the parent owns the group list and computes totals from it.
 */
export function ReceiveLine({
  line,
  product,
  variants,
  groups,
  onChange,
  manual,
  onRemoveLine,
}: {
  line: LocalPurchaseOrderItem
  product: LocalProduct
  variants: LocalVariant[]
  groups: RecvGroup[]
  onChange: (groups: RecvGroup[]) => void
  /** Ad-hoc restock line (no PO target): hide expected/remaining, allow removing the line. */
  manual?: boolean
  onRemoveLine?: () => void
}) {
  const t = useT()
  const money = useCurrency()
  // Per-group draft text for the serial scan/typed input (committed on Enter/scan).
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const serialized = product.isSerialized
  const serialType: SerialType = product.serialType ?? 'SERIAL_NUMBER'
  const hasVariants = variants.length > 0
  const fixedVariant = line.variantId
  // Single bucket when the product has no variants, or the PO line already targets one.
  const single = !hasVariants || !!fixedVariant
  const variantName = (id: string | null) => variants.find((v) => v.id === id)?.name ?? null

  const remaining = Math.max(0, line.quantity - line.receivedQuantity)
  const received = groups.reduce((s, g) => s + (serialized ? validSerials(g).length : num(g.qty)), 0)

  function validSerials(g: RecvGroup): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of g.serials) {
      const key = s.toLowerCase()
      if (!seen.has(key) && validateSerial(s, serialType)) out.push(s)
      seen.add(key)
    }
    return out
  }

  const patch = (key: string, p: Partial<RecvGroup>) => onChange(groups.map((g) => (g.key === key ? { ...g, ...p } : g)))
  const removeGroup = (key: string) => onChange(groups.filter((g) => g.key !== key))

  const setDraft = (key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v }))
  const addSerials = (g: RecvGroup, raw: string) => {
    const next = splitSerials(raw)
    if (!next.length) return
    patch(g.key, { serials: [...g.serials, ...next] })
    setDraft(g.key, '')
  }
  const removeSerial = (g: RecvGroup, idx: number) => patch(g.key, { serials: g.serials.filter((_, i) => i !== idx) })

  const usedVariantIds = new Set(groups.map((g) => g.variantId))
  const availableVariants = variants.filter((v) => !usedVariantIds.has(v.id))

  const countClass = received === 0 ? '' : received >= remaining && remaining > 0 ? (received > remaining ? 'over' : 'full') : ''

  const serialEntry = (g: RecvGroup) => {
    const valid = validSerials(g)
    return (
      <>
        <ScanInput
          value={drafts[g.key] ?? ''}
          placeholder={t(`prodf.serialPh_${serialType}` as Parameters<typeof t>[0])}
          inputMode={serialType === 'IMEI' ? 'numeric' : 'text'}
          onChange={(e) => setDraft(g.key, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addSerials(g, drafts[g.key] ?? '')
            }
          }}
          onScan={(v) => addSerials(g, v)}
          scanTitle={t('scan.title')}
          cameraTitle={t('scan.camTitle')}
          cameraHint={t('scan.camHint')}
          cameraError={t('scan.camError')}
          style={{ height: 34 }}
        />
        {g.serials.length > 0 ? (
          <div className="ser-chips">
            {g.serials.map((s, i) => {
              const dup = g.serials.findIndex((x) => x.toLowerCase() === s.toLowerCase()) !== i
              const bad = !validateSerial(s, serialType) || dup
              return (
                <span key={`${s}-${i}`} className={`serial-pill${bad ? ' bad' : ''}`} title={bad ? t('recv.serialBad') : undefined}>
                  {s}
                  <button type="button" aria-label={t('recv.removeSerial')} onClick={() => removeSerial(g, i)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </span>
              )
            })}
          </div>
        ) : (
          <div className="ser-empty">{t('recv.serialsHint')}</div>
        )}
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-2)' }}>{t('recv.serialsCount').replace('{n}', String(valid.length))}</div>
      </>
    )
  }

  const costInput = (g: RecvGroup) => (
    <Input value={g.cost} inputMode="decimal" aria-label={t('recv.colUnitCost')} placeholder="0" onChange={(e) => patch(g.key, { cost: e.target.value })} style={{ height: 34, width: 110, textAlign: 'right' }} />
  )

  return (
    <div className="recv-line">
      <div className="recv-line-h">
        <div>
          <div className="nm">{product.name}{single && fixedVariant ? ` · ${variantName(fixedVariant) ?? ''}` : ''}</div>
          <div className="sub">
            {manual ? (serialized ? t('recv.serialized') : t('recv.manualLineHint')) : t('recv.received').replace('{r}', String(line.receivedQuantity)).replace('{q}', String(line.quantity)) + (serialized ? ` · ${t('recv.serialized')}` : '')}
          </div>
        </div>
        {manual ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="recv-count">{received}</span>
            <button type="button" className="icon-btn" aria-label={t('recv.removeLine')} onClick={onRemoveLine}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 15, height: 15 }}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
            </button>
          </div>
        ) : (
          <span className={`recv-count ${countClass}`}>{received} / {remaining}</span>
        )}
      </div>

      {single ? (
        // One bucket (no variants, or line already targets a variant).
        groups[0] ? (
          <div style={{ display: 'flex', gap: 10, alignItems: serialized ? 'flex-start' : 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              {serialized ? serialEntry(groups[0]) : (
                <Input value={groups[0].qty} inputMode="numeric" aria-label={t('recv.colReceiving')} placeholder="0" onChange={(e) => patch(groups[0]!.key, { qty: e.target.value })} style={{ height: 34, maxWidth: 140, textAlign: 'right' }} />
              )}
            </div>
            <div>
              <div className="lbl2" style={{ fontSize: 10.5, marginBottom: 3 }}>{t('recv.colUnitCost')}</div>
              {costInput(groups[0])}
            </div>
          </div>
        ) : null
      ) : (
        // One bucket per variant (product-level line on a variant product).
        <>
          {groups.length === 0 ? <div className="ser-empty">{t('recv.pickVariantHint')}</div> : null}
          {groups.map((g) => (
            <div key={g.key} className="recv-vgroup">
              <div className="recv-vgroup-h">
                <span className="vn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}><path d="M20.59 13.41 11 3.83V8h0L3 16l5 5 8-8h4.17z" /></svg>
                  {variantName(g.variantId) ?? t('recv.variant')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {!serialized ? (
                    <Input value={g.qty} inputMode="numeric" aria-label={t('recv.colReceiving')} placeholder="0" onChange={(e) => patch(g.key, { qty: e.target.value })} style={{ height: 30, width: 80, textAlign: 'right' }} />
                  ) : null}
                  {costInput(g)}
                  <button type="button" className="icon-btn" aria-label={t('recv.removeVariant')} onClick={() => removeGroup(g.key)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 15, height: 15 }}><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              </div>
              {serialized ? serialEntry(g) : null}
            </div>
          ))}
          {availableVariants.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) onChange([...groups, newGroup(e.target.value, groups[0]?.cost ?? String(line.unitPrice))])
                }}
                style={{ height: 34, maxWidth: 220 }}
              >
                <option value="">{t('recv.addVariant')}</option>
                {availableVariants.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
