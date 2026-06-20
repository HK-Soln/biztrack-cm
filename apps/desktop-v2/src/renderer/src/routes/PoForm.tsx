import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, CommandSelect, Input } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { todayIso } from '@/lib/date'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { ItemsField, type ItemLine } from '@/components/procurement/ItemsField'
import type { CreatePurchaseOrderRequest } from '@shared/ipc'

const num = (s: string | undefined) => (s && s.trim() ? Number(s.replace(/\s/g, '')) : 0)

export function PoForm() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const money = useCurrency()

  // Pre-seeded from the inventory reorder banner ("Generate PO").
  const seedItems = (location.state as { seedItems?: ItemLine[] } | null)?.seedItems
  // Preselected supplier (e.g. opened from a supplier's contact detail).
  const supplierParam = searchParams.get('supplier')

  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [supplierName, setSupplierName] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [expectedDate, setExpectedDate] = useState(todayIso)
  const [items, setItems] = useState<ItemLine[]>(() => seedItems ?? [])
  const [error, setError] = useState<string | null>(null)

  const { data: suppliers = [] } = useQuery({
    queryKey: [...queryKeys.contacts, 'suppliers'],
    queryFn: () => dataClient.contacts.listAllSuppliers(),
    enabled: isElectron,
  })
  const loadSuppliers = useCallback(
    async (search: string) => {
      const q = search.trim().toLowerCase()
      return suppliers
        .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.phone ?? '').includes(q))
        .slice(0, 30)
        .map((s) => ({ value: s.id, label: s.name, sublabel: s.phone ?? undefined }))
    },
    [suppliers],
  )

  // Preselect the supplier from ?supplier=<id> once the supplier list loads.
  useEffect(() => {
    if (!supplierParam || supplierId) return
    const s = suppliers.find((x) => x.id === supplierParam)
    if (s) { setSupplierId(s.id); setSupplierName(s.name) }
  }, [supplierParam, supplierId, suppliers])

  const total = items.reduce((s, l) => s + num(l.quantity) * num(l.unitPrice), 0)

  const create = useMutation({
    mutationFn: (_opts: { send: boolean }) => {
      const payload: CreatePurchaseOrderRequest = {
        supplierId: supplierId!,
        title: title.trim() || undefined,
        messageBody: message.trim() || undefined,
        expectedDate: expectedDate || undefined,
        items: items.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, quantity: num(l.quantity) || 1, unitPrice: num(l.unitPrice) })),
      }
      return dataClient.purchaseOrders.create(payload)
    },
    // When "Create & send", land on the PO detail with the share dialog opened.
    onSuccess: (po, vars) => navigate(`/purchasing/orders/${po.id}`, vars.send ? { state: { share: true } } : undefined),
    onError: (e) => setError(errorMessage(e, t('po.saveError'))),
  })

  const submit = (send: boolean) => {
    if (!supplierId) return setError(t('po.supplierRequired'))
    if (items.length === 0) return setError(t('po.itemsRequired'))
    if (items.some((l) => num(l.quantity) <= 0)) return setError(t('po.qtyInvalid'))
    if (total <= 0) return setError(t('po.totalZero'))
    setError(null)
    create.mutate({ send })
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
            <CommandSelect
              value={supplierId}
              valueLabel={supplierName}
              onChange={(id, opt) => { setSupplierId(id); setSupplierName(opt?.label ?? null); setError(null) }}
              loadOptions={loadSuppliers}
              placeholder={t('po.pickSupplier')}
              searchPlaceholder={t('field.searchSuppliers')}
              invalid={!!error && !supplierId}
            />
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
        <ItemsField value={items} onChange={(v) => { setItems(v); setError(null) }} withPrice />
        {items.length > 0 ? (
          <div className="totals" style={{ marginLeft: 'auto', width: 260, marginTop: 12 }}>
            <div className="row grand" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{t('po.total')}</span><span>{money.format(total)}</span></div>
          </div>
        ) : null}
      </div>

      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="soft" onClick={() => navigate('/purchasing/orders')} disabled={create.isPending}>{t('po.cancel')}</Button>
        <Button variant="soft" loading={create.isPending} onClick={() => submit(false)}>{t('po.create')}</Button>
        <Button variant="primary" loading={create.isPending} onClick={() => submit(true)}>{t('po.createSend')}</Button>
      </div>
    </div>
  )
}
