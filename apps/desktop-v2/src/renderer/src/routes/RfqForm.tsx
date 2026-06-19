import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Input, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { CreateRfqRequest } from '@shared/ipc'

interface Line {
  productId: string
  name: string
  quantity: string
}

export function RfqForm() {
  const t = useT()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [supplierIds, setSupplierIds] = useState<string[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [pickProduct, setPickProduct] = useState('')
  const [pickQty, setPickQty] = useState('1')
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

  const toggleSupplier = (id: string) =>
    setSupplierIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const addLine = () => {
    if (!pickProduct) return
    if (lines.some((l) => l.productId === pickProduct)) return
    const p = productOptions.find((x) => x.id === pickProduct)
    if (!p) return
    setLines((ls) => [...ls, { productId: p.id, name: p.name, quantity: pickQty || '1' }])
    setPickProduct('')
    setPickQty('1')
    setError(null)
  }

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateRfqRequest = {
        title: title.trim() || undefined,
        messageBody: message.trim() || undefined,
        supplierIds,
        items: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) || 1 })),
      }
      return dataClient.rfqs.create(payload)
    },
    onSuccess: (rfq) => navigate(`/purchasing/rfqs/${rfq.id}`),
    onError: (e) => setError(errorMessage(e, t('rfq.saveError'))),
  })

  const submit = () => {
    if (lines.length === 0) return setError(t('rfq.itemsRequired'))
    if (supplierIds.length === 0) return setError(t('rfq.suppliersRequired'))
    setError(null)
    create.mutate()
  }

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/purchasing/rfqs')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('rfq.title')}
      </button>

      <div className="page-head">
        <div>
          <h1>{t('rfq.new')}</h1>
          <p>{t('rfq.newSub')}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><div><h3>{t('rfq.details')}</h3></div></div>
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('rfq.fieldTitle')}</label>
          <Input value={title} placeholder={t('rfq.titlePh')} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="ff">
          <label className="lbl2">{t('rfq.message')}</label>
          <textarea className="ta" rows={2} value={message} placeholder={t('rfq.messagePh')} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('rfq.items')}</h3></div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <Select value={pickProduct} onChange={(e) => setPickProduct(e.target.value)}>
              <option value="">{t('rfq.pickProduct')}</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <Input value={pickQty} inputMode="numeric" onChange={(e) => setPickQty(e.target.value)} style={{ width: 90 }} />
          <Button variant="soft" onClick={addLine}>+ {t('rfq.addItem')}</Button>
        </div>
        {lines.length === 0 ? (
          <div className="hint">{t('rfq.noItems')}</div>
        ) : (
          <table className="ltbl">
            <thead><tr><th>{t('rfq.colItem')}</th><th className="right" style={{ width: 100 }}>{t('rfq.colQty')}</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td className="right"><Input value={l.quantity} inputMode="numeric" onChange={(e) => setLines((ls) => ls.map((x) => x.productId === l.productId ? { ...x, quantity: e.target.value } : x))} style={{ height: 32, textAlign: 'right' }} /></td>
                  <td className="right">
                    <button type="button" title={t('rfq.remove')} onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))} style={{ color: 'var(--danger)', background: 'none', border: 0, cursor: 'pointer' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('rfq.suppliers')}</h3><p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{t('rfq.suppliersSub')}</p></div></div>
        {suppliers.length === 0 ? (
          <div className="hint">{t('rfq.noSuppliers')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suppliers.map((s) => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 4px' }}>
                <input type="checkbox" checked={supplierIds.includes(s.id)} onChange={() => toggleSupplier(s.id)} />
                <span>{s.name}{s.phone ? ` · ${s.phone}` : ''}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="soft" onClick={() => navigate('/purchasing/rfqs')} disabled={create.isPending}>{t('rfq.cancel')}</Button>
        <Button variant="primary" loading={create.isPending} onClick={submit}>{t('rfq.create')}</Button>
      </div>
    </div>
  )
}
