import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button, Input } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { ItemsField, type ItemLine } from '@/components/procurement/ItemsField'
import { SuppliersField } from '@/components/procurement/SuppliersField'
import type { CreateRfqRequest } from '@shared/ipc'

export function RfqForm() {
  const t = useT()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [supplierIds, setSupplierIds] = useState<string[]>([])
  const [items, setItems] = useState<ItemLine[]>([])
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateRfqRequest = {
        title: title.trim() || undefined,
        messageBody: message.trim() || undefined,
        supplierIds,
        items: items.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) || 1 })),
      }
      return dataClient.rfqs.create(payload)
    },
    onSuccess: (rfq) => navigate(`/purchasing/rfqs/${rfq.id}`),
    onError: (e) => setError(errorMessage(e, t('rfq.saveError'))),
  })

  const submit = () => {
    if (items.length === 0) return setError(t('rfq.itemsRequired'))
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
        <ItemsField value={items} onChange={(v) => { setItems(v); setError(null) }} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('rfq.suppliers')}</h3><p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{t('rfq.suppliersSub')}</p></div></div>
        <SuppliersField value={supplierIds} onChange={(v) => { setSupplierIds(v); setError(null) }} />
      </div>

      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="soft" onClick={() => navigate('/purchasing/rfqs')} disabled={create.isPending}>{t('rfq.cancel')}</Button>
        <Button variant="primary" loading={create.isPending} onClick={submit}>{t('rfq.create')}</Button>
      </div>
    </div>
  )
}
