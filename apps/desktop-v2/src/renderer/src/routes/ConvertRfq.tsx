import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Input, Select } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { todayIso } from '@/lib/date'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { LocalVariant } from '@shared/ipc'

const num = (s: string) => (s?.trim() ? Number(s.replace(/\s/g, '')) : 0)
const newKey = () => crypto.randomUUID()

interface Line { key: string; productId: string; variantId: string | null; description: string; quantity: string; unitPrice: string }

/** Full-page conversion of a supplier's RFQ quote into a purchase order. Lines seed
 * from the RFQ; quantities/prices are editable, variant products can target (and add)
 * specific variants, and lines can be dropped. Creating the PO closes the request. */
export function ConvertRfq() {
  const { id = '', supplierId = '' } = useParams()
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()

  const { data: rfq, isPending } = useQuery({
    queryKey: [...queryKeys.rfqs, id],
    queryFn: () => dataClient.rfqs.get(id),
    enabled: !!id,
  })
  const supplier = rfq?.suppliers.find((s) => s.id === supplierId) ?? null

  const { data: variantsByProduct = {} } = useQuery({
    queryKey: [...queryKeys.rfqs, id, 'convert-variants'],
    enabled: !!rfq,
    queryFn: async () => {
      const ids = [...new Set((rfq?.items ?? []).map((i) => i.productId))]
      const entries = await Promise.all(ids.map(async (pid) => [pid, await dataClient.products.listVariants(pid)] as const))
      return Object.fromEntries(entries) as Record<string, LocalVariant[]>
    },
  })
  const lineVariants = (productId: string): LocalVariant[] => variantsByProduct[productId] ?? []

  const [lines, setLines] = useState<Line[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [expected, setExpected] = useState(todayIso)
  const [error, setError] = useState<string | null>(null)
  const [inited, setInited] = useState(false)

  useEffect(() => {
    if (inited || !rfq) return
    setLines(rfq.items.map((it) => ({ key: it.id, productId: it.productId, variantId: it.variantId ?? null, description: it.description, quantity: String(it.quantity), unitPrice: '' })))
    setTitle(rfq.title ?? '')
    setMessage(rfq.messageBody ?? '')
    setInited(true)
  }, [inited, rfq])

  const total = lines.reduce((s, l) => s + num(l.quantity) * num(l.unitPrice), 0)
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key))
  const addVariantLine = (l: Line) =>
    setLines((ls) => {
      const idx = ls.findIndex((x) => x.key === l.key)
      const clone: Line = { key: newKey(), productId: l.productId, variantId: null, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }
      const next = [...ls]
      next.splice(idx + 1, 0, clone)
      return next
    })
  // Selectable variants on a line = the product's, minus those taken by sibling lines.
  const optionsFor = (l: Line): LocalVariant[] => {
    const taken = new Set(lines.filter((o) => o.key !== l.key && o.productId === l.productId).map((o) => o.variantId).filter(Boolean) as string[])
    return lineVariants(l.productId).filter((v) => v.id === l.variantId || !taken.has(v.id))
  }

  const save = useMutation({
    mutationFn: () =>
      dataClient.purchaseOrders.createFromRfq(id, {
        rfqSupplierId: supplierId,
        title: title.trim() || undefined,
        messageBody: message.trim() || undefined,
        // For variant products, let the API derive "Product · Variant" from the variantId.
        items: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          description: lineVariants(l.productId).length > 0 ? '' : l.description,
          quantity: num(l.quantity),
          unitPrice: num(l.unitPrice),
        })),
        expectedDate: expected || undefined,
      }),
    onSuccess: (po) => navigate(`/purchasing/orders/${po.id}`),
    onError: (e) => setError(errorMessage(e, t('rfq.convertError'))),
  })

  const submit = () => {
    if (!lines.length) return setError(t('rfq.convertNoItems'))
    if (lines.some((l) => num(l.quantity) <= 0)) return setError(t('rfq.convertQtyInvalid'))
    if (lines.some((l) => lineVariants(l.productId).length > 0 && !l.variantId)) return setError(t('rfq.convertVariantRequired'))
    if (total <= 0) return setError(t('rfq.convertTotalZero'))
    setError(null)
    save.mutate()
  }

  if (isPending || !rfq) return <div className="frame"><div className="cat-empty">{t('rfq.loading')}</div></div>
  if (!supplier) return <div className="frame"><div className="cat-empty">{t('rfq.notFound')}</div></div>

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate(`/purchasing/rfqs/${id}`)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {rfq.number}
      </button>

      <div className="page-head">
        <div>
          <h1>{t('rfq.convertTitle')}</h1>
          <p>{t('rfq.convertSub').replace('{name}', supplier.supplierName ?? '')}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><div><h3>{t('rfq.items')}</h3></div></div>
        <table className="ltbl">
          <thead><tr><th>{t('rfq.colItem')}</th><th className="right" style={{ width: 90 }}>{t('rfq.colQty')}</th><th className="right" style={{ width: 140 }}>{t('rfq.unitPrice')}</th><th style={{ width: 36 }} /></tr></thead>
          <tbody>
            {lines.map((l) => {
              const variants = lineVariants(l.productId)
              const options = optionsFor(l)
              const moreVariants = variants.length > lines.filter((o) => o.productId === l.productId).length
              return (
                <tr key={l.key}>
                  <td>
                    <div>{l.description}</div>
                    {variants.length > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                        <Select
                          value={l.variantId ?? ''}
                          onChange={(e) => { setLine(l.key, { variantId: e.target.value || null }); setError(null) }}
                          style={{ height: 30, maxWidth: 220, ...(!!error && !l.variantId ? { borderColor: 'var(--danger)' } : {}) }}
                        >
                          <option value="">{t('field.pickVariant')}</option>
                          {options.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </Select>
                        {moreVariants ? (
                          <button type="button" className="link-btn" onClick={() => addVariantLine(l)}>{t('rfq.addVariantLine')}</button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="right"><Input value={l.quantity} inputMode="decimal" placeholder="0" onChange={(e) => { setLine(l.key, { quantity: e.target.value }); setError(null) }} style={{ height: 32, textAlign: 'right' }} /></td>
                  <td className="right"><Input value={l.unitPrice} inputMode="decimal" placeholder="0" onChange={(e) => { setLine(l.key, { unitPrice: e.target.value }); setError(null) }} style={{ height: 32, textAlign: 'right' }} /></td>
                  <td className="right">
                    <button type="button" className="icon-btn" aria-label={t('rfq.remove')} onClick={() => { removeLine(l.key); setError(null) }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 16, height: 16 }}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                    </button>
                  </td>
                </tr>
              )
            })}
            {!lines.length ? <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 16 }}>{t('rfq.convertNoItems')}</td></tr> : null}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 10 }}><span>{t('rfq.poTotal')}</span><span>{money.format(total)}</span></div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('po.details')}</h3></div></div>
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('po.fieldTitle')}</label>
          <Input value={title} placeholder={t('po.titlePh')} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('po.message')}</label>
          <textarea className="ta" rows={2} value={message} placeholder={t('po.messagePh')} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
        </div>
        <div className="ff" style={{ maxWidth: 220 }}>
          <label className="lbl2">{t('rfq.expected')}</label>
          <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </div>
      </div>

      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="soft" onClick={() => navigate(`/purchasing/rfqs/${id}`)} disabled={save.isPending}>{t('rfq.cancel')}</Button>
        <Button variant="primary" loading={save.isPending} onClick={submit}>{t('rfq.convertConfirm')}</Button>
      </div>
    </div>
  )
}
