import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Input, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { CreatePurchaseOrderRequest } from '@shared/ipc'

interface Line {
  productId: string
  name: string
  quantity: string
  unitPrice: string
}
const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)

export function PoForm() {
  const t = useT()
  const navigate = useNavigate()
  const money = useCurrency()

  const [supplierId, setSupplierId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [pickProduct, setPickProduct] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: suppliers = [] } = useQuery({
    queryKey: [...queryKeys.contacts, 'suppliers'],
    queryFn: () => dataClient.contacts.listAllSuppliers(),
    enabled: isElectron,
  })
  const { data: products } = useQuery({
    queryKey: [...queryKeys.products, 'picker'],
    queryFn: () => dataClient.products.list({ limit: 100 }),
    enabled: isElectron,
  })
  const productOptions = products?.data ?? []

  const total = lines.reduce((s, l) => s + num(l.quantity) * num(l.unitPrice), 0)

  const addLine = () => {
    if (!pickProduct || lines.some((l) => l.productId === pickProduct)) return
    const p = productOptions.find((x) => x.id === pickProduct)
    if (!p) return
    setLines((ls) => [...ls, { productId: p.id, name: p.name, quantity: '1', unitPrice: p.effectiveCostPrice != null ? String(p.effectiveCostPrice) : '' }])
    setPickProduct('')
    setError(null)
  }
  const patch = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, ...p } : l)))

  const create = useMutation({
    mutationFn: () => {
      const payload: CreatePurchaseOrderRequest = {
        supplierId,
        title: title.trim() || undefined,
        messageBody: message.trim() || undefined,
        expectedDate: expectedDate || undefined,
        items: lines.map((l) => ({ productId: l.productId, quantity: num(l.quantity) || 1, unitPrice: num(l.unitPrice) })),
      }
      return dataClient.purchaseOrders.create(payload)
    },
    onSuccess: (po) => navigate(`/purchasing/orders/${po.id}`),
    onError: (e) => setError(errorMessage(e, t('po.saveError'))),
  })

  const submit = () => {
    if (!supplierId) return setError(t('po.supplierRequired'))
    if (lines.length === 0) return setError(t('po.itemsRequired'))
    setError(null)
    create.mutate()
  }

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/purchasing/orders')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('po.title')}
      </button>

      <div className="page-head">
        <div>
          <h1>{t('po.new')}</h1>
          <p>{t('po.newSub')}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><div><h3>{t('po.details')}</h3></div></div>
        <div className="form-2col">
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('po.supplier')} <span className="req">*</span></label>
            <Select value={supplierId} error={!!error && !supplierId} onChange={(e) => { setSupplierId(e.target.value); setError(null) }}>
              <option value="">{t('po.pickSupplier')}</option>
              {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </Select>
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('po.expected')}</label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('po.fieldTitle')}</label>
          <Input value={title} placeholder={t('po.titlePh')} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="ff">
          <label className="lbl2">{t('po.message')}</label>
          <textarea className="ta" rows={2} value={message} placeholder={t('po.messagePh')} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('po.items')}</h3></div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <Select value={pickProduct} onChange={(e) => setPickProduct(e.target.value)}>
              <option value="">{t('po.pickProduct')}</option>
              {productOptions.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </Select>
          </div>
          <Button variant="soft" onClick={addLine}>+ {t('po.addItem')}</Button>
        </div>
        {lines.length === 0 ? (
          <div className="hint">{t('po.noItems')}</div>
        ) : (
          <table className="ltbl">
            <thead><tr><th>{t('po.colItem')}</th><th className="right" style={{ width: 90 }}>{t('po.colQty')}</th><th className="right" style={{ width: 120 }}>{t('po.colUnitPrice')}</th><th className="right">{t('po.colLineTotal')}</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td className="right"><Input value={l.quantity} inputMode="numeric" onChange={(e) => patch(l.productId, { quantity: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td>
                  <td className="right"><Input value={l.unitPrice} inputMode="decimal" placeholder="0" onChange={(e) => patch(l.productId, { unitPrice: e.target.value })} style={{ height: 32, textAlign: 'right' }} /></td>
                  <td className="right num">{money.format(num(l.quantity) * num(l.unitPrice))}</td>
                  <td className="right">
                    <button type="button" title={t('po.remove')} onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))} style={{ color: 'var(--danger)', background: 'none', border: 0, cursor: 'pointer' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="totals" style={{ marginLeft: 'auto', width: 260, marginTop: 8 }}>
          <div className="row grand" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{t('po.total')}</span><span>{money.format(total)}</span></div>
        </div>
      </div>

      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="soft" onClick={() => navigate('/purchasing/orders')} disabled={create.isPending}>{t('po.cancel')}</Button>
        <Button variant="primary" loading={create.isPending} onClick={submit}>{t('po.create')}</Button>
      </div>
    </div>
  )
}
