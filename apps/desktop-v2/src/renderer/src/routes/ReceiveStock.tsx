import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BackButton, Button, CommandSelect, Input, Stepper } from '@biztrack/ui/biztrack'
import { PaymentMethod } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { todayIso } from '@/lib/date'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { FileUpload } from '@/components/FileUpload'
import { ReceiveLine, newGroup, type RecvGroup } from '@/components/inventory/receive/ReceiveLine'
import { QuickCreateProduct } from '@/components/inventory/receive/QuickCreateProduct'
import { useStepKeys } from '@/components/inventory/receive/useStepKeys'
import {
  buildRestockInput,
  computeTotals,
  isMomo,
  newId,
  num,
  round2,
  TENDERS,
  type ChargeRow,
  type DiscountRow,
  type PaymentRow,
} from '@/components/inventory/receive/receiveModel'
import { validateSerial } from '@/lib/serial'
import type {
  LocalProduct,
  LocalPurchaseOrderItem,
  LocalVariant,
  RestockItemInput,
} from '@shared/ipc'

const DRAFT_KEY = 'biztrack:receive-draft'

interface ProductMeta {
  product: LocalProduct
  variants: LocalVariant[]
}
interface Line {
  id: string
  productId: string
  name: string
}
// The serialisable slice we persist so a refresh resumes the receipt (meta is re-fetched).
interface PersistedDraft {
  lines: Line[]
  groups: Record<string, RecvGroup[]>
  poId: string | null
  poNumber: string | null
  poSupplierId: string | null
  poSupplierName: string | null
  supplierId: string | null
  supplierName: string | null
  reference: string
  charges: ChargeRow[]
  discounts: DiscountRow[]
  payments: PaymentRow[]
  paymentsTouched: boolean
  invoiceNumber: string
  invoiceDate: string
  invoiceFileUrl: string | null
}

/**
 * Unified Receive Stock wizard: restock existing products AND quick-create brand-new ones in one
 * guided, keyboard-navigable flow — optionally against a purchase order. Three steps: Items →
 * Supplier & payment → Review. Autosaves a draft so a refresh resumes.
 */
export function ReceiveStock() {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const poParam = searchParams.get('po')
  const productParam = searchParams.get('product')

  // --- items state ---
  const [lines, setLines] = useState<Line[]>([])
  const [meta, setMeta] = useState<Record<string, ProductMeta>>({})
  const [groups, setGroups] = useState<Record<string, RecvGroup[]>>({})
  const [poId, setPoId] = useState<string | null>(null)
  const [poNumber, setPoNumber] = useState<string | null>(null)
  const [poSupplierId, setPoSupplierId] = useState<string | null>(null)
  const [poSupplierName, setPoSupplierName] = useState<string | null>(null)

  // --- settlement state ---
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [supplierName, setSupplierName] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [discounts, setDiscounts] = useState<DiscountRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [paymentsTouched, setPaymentsTouched] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayIso)
  const [invoiceFileUrl, setInvoiceFileUrl] = useState<string | null>(null)

  // --- wizard state ---
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  const allowSupplierPick = !poId

  const loadMeta = useCallback(
    async (productId: string): Promise<ProductMeta | null> => {
      const existing = meta[productId]
      if (existing) return existing
      const [product, variants] = await Promise.all([
        dataClient.products.get(productId),
        dataClient.products.listVariants(productId),
      ])
      if (!product) return null
      const m = { product, variants }
      setMeta((s) => ({ ...s, [productId]: m }))
      return m
    },
    [meta],
  )

  const addProduct = useCallback(
    async (productId: string | null, label?: string, cost = '') => {
      if (!productId) return
      const m = await loadMeta(productId)
      if (!m) return
      const lineId = newId()
      const hasVariants = m.variants.length > 0
      setLines((ls) => [...ls, { id: lineId, productId, name: label ?? m.product.name }])
      setGroups((s) => ({ ...s, [lineId]: hasVariants ? [] : [newGroup(null, cost)] }))
      setError(null)
    },
    [loadMeta],
  )

  const removeLine = (lineId: string) => {
    setLines((ls) => ls.filter((l) => l.id !== lineId))
    setGroups((s) => {
      const next = { ...s }
      delete next[lineId]
      return next
    })
  }

  // --- draft persistence (skip while a PO/product deep-link is driving the flow) ---
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    if (poParam || productParam) return
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as PersistedDraft
      if (!d.lines?.length) return
      setLines(d.lines)
      setGroups(d.groups ?? {})
      setPoId(d.poId)
      setPoNumber(d.poNumber)
      setPoSupplierId(d.poSupplierId)
      setPoSupplierName(d.poSupplierName)
      setSupplierId(d.supplierId)
      setSupplierName(d.supplierName)
      setReference(d.reference ?? '')
      setCharges(d.charges ?? [])
      setDiscounts(d.discounts ?? [])
      setPayments(d.payments ?? [])
      setPaymentsTouched(d.paymentsTouched ?? false)
      setInvoiceNumber(d.invoiceNumber ?? '')
      setInvoiceDate(d.invoiceDate || todayIso())
      setInvoiceFileUrl(d.invoiceFileUrl ?? null)
      setDraftRestored(true)
      void Promise.all(d.lines.map((l) => loadMeta(l.productId)))
    } catch {
      /* ignore malformed draft */
    }
  }, [poParam, productParam, loadMeta])

  // Persist on change (once there's something to save).
  useEffect(() => {
    if (!bootstrapped.current) return
    if (lines.length === 0) {
      localStorage.removeItem(DRAFT_KEY)
      return
    }
    const d: PersistedDraft = {
      lines,
      groups,
      poId,
      poNumber,
      poSupplierId,
      poSupplierName,
      supplierId,
      supplierName,
      reference,
      charges,
      discounts,
      payments,
      paymentsTouched,
      invoiceNumber,
      invoiceDate,
      invoiceFileUrl,
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      /* quota — ignore */
    }
  }, [
    lines,
    groups,
    poId,
    poNumber,
    poSupplierId,
    poSupplierName,
    supplierId,
    supplierName,
    reference,
    charges,
    discounts,
    payments,
    paymentsTouched,
    invoiceNumber,
    invoiceDate,
    invoiceFileUrl,
  ])

  // --- PO prefill (?po=<id>) ---
  const { data: po } = useQuery({
    queryKey: [...queryKeys.purchaseOrders, poParam, 'receive'],
    queryFn: () => dataClient.purchaseOrders.get(poParam as string),
    enabled: !!poParam,
  })
  const poInited = useRef(false)
  useEffect(() => {
    if (poInited.current || !po) return
    poInited.current = true
    setPoId(po.id)
    setPoNumber(po.number)
    setPoSupplierId(po.supplierId ?? null)
    setPoSupplierName(po.supplierName ?? null)
    setSupplierId(po.supplierId ?? null)
    setSupplierName(po.supplierName ?? null)
    setReference(po.number)
    ;(async () => {
      const nextLines: Line[] = []
      const nextGroups: Record<string, RecvGroup[]> = {}
      for (const item of po.items) {
        const m = await loadMeta(item.productId)
        if (!m) continue
        const lineId = newId()
        const hasVariants = m.variants.length > 0
        const single = !hasVariants || !!item.variantId
        const serialized = m.product.isSerialized
        const remaining = Math.max(0, item.quantity - item.receivedQuantity)
        nextLines.push({ id: lineId, productId: item.productId, name: m.product.name })
        nextGroups[lineId] = single
          ? [
              {
                ...newGroup(item.variantId ?? null, String(item.unitPrice)),
                qty: serialized ? '' : String(remaining),
              },
            ]
          : []
      }
      setLines(nextLines)
      setGroups(nextGroups)
    })()
  }, [po, loadMeta])

  // --- product prefill (?product=<id>) ---
  const productInited = useRef(false)
  useEffect(() => {
    if (productInited.current || !productParam) return
    productInited.current = true
    void addProduct(productParam)
  }, [productParam, addProduct])

  // --- charge types + suppliers ---
  const { data: chargeTypes = [] } = useQuery({
    queryKey: ['charge-types'],
    queryFn: () => dataClient.charges.listActive(),
    enabled: isElectron,
  })
  const { data: suppliers = [] } = useQuery({
    queryKey: [...queryKeys.contacts, 'suppliers'],
    queryFn: () => dataClient.contacts.listAllSuppliers(),
    enabled: isElectron && allowSupplierPick,
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
  const loadProducts = useCallback(async (search: string) => {
    const res = await dataClient.products.list({ search: search || undefined, limit: 20 })
    return res.data.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: p.sku ?? undefined,
      imageUrl: p.imageUrl,
    }))
  }, [])

  // --- computed items + totals ---
  const built = useMemo(() => {
    const items: RestockItemInput[] = []
    let subtotal = 0
    let units = 0
    for (const ml of lines) {
      const m = meta[ml.productId]
      if (!m) continue
      const serialized = m.product.isSerialized
      const serialType = m.product.serialType ?? 'SERIAL_NUMBER'
      for (const g of groups[ml.id] ?? []) {
        const cost = num(g.cost)
        if (serialized) {
          const seen = new Set<string>()
          const valid = g.serials.filter((s) => {
            const k = s.toLowerCase()
            if (seen.has(k) || !validateSerial(s, serialType)) return false
            seen.add(k)
            return true
          })
          if (valid.length === 0) continue
          items.push({
            productId: ml.productId,
            variantId: g.variantId,
            serialNumbers: valid,
            unitCost: cost,
          })
          subtotal += valid.length * cost
          units += valid.length
        } else {
          const qty = num(g.qty)
          if (qty <= 0) continue
          items.push({
            productId: ml.productId,
            variantId: g.variantId,
            quantity: qty,
            unitCost: cost,
          })
          subtotal += qty * cost
          units += qty
        }
      }
    }
    return { items, subtotal: round2(subtotal), units }
  }, [lines, meta, groups])

  const totals = useMemo(
    () => computeTotals(built.subtotal, charges, discounts, payments),
    [built.subtotal, charges, discounts, payments],
  )

  // Default a single cash payment for the running total until the user edits payments.
  useEffect(() => {
    if (paymentsTouched) return
    setPayments([
      {
        id: newId(),
        method: PaymentMethod.CASH,
        amount: totals.total > 0 ? String(totals.total) : '',
        momoRef: '',
      },
    ])
  }, [paymentsTouched, totals.total])

  // --- settlement editing helpers ---
  const addFromMenu = (value: string) => {
    if (value === 'custom')
      setCharges((c) => [
        ...c,
        { id: newId(), chargeTypeId: null, name: '', rateType: 'FIXED', value: '' },
      ])
    else if (value === 'discount')
      setDiscounts((d) => [
        ...d,
        { id: newId(), description: '', discountType: 'FIXED_AMOUNT', value: '' },
      ])
    else if (value.startsWith('ct:')) {
      const ct = chargeTypes.find((x) => x.id === value.slice(3))
      if (ct)
        setCharges((c) => [
          ...c,
          {
            id: newId(),
            chargeTypeId: ct.id,
            name: ct.name,
            rateType: ct.rateType,
            value: String(ct.defaultValue || ''),
          },
        ])
    }
  }
  const patchCharge = (id: string, p: Partial<ChargeRow>) =>
    setCharges((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const patchDiscount = (id: string, p: Partial<DiscountRow>) =>
    setDiscounts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)))
  const toggleMethod = (method: PaymentMethod) => {
    setPaymentsTouched(true)
    setPayments((ps) =>
      ps.find((p) => p.method === method)
        ? ps.filter((p) => p.method !== method)
        : [
            ...ps,
            {
              id: newId(),
              method,
              amount: ps.length === 0 && totals.total > 0 ? String(totals.total) : '',
              momoRef: '',
            },
          ],
    )
  }
  const setPayment = (mid: string, p: Partial<PaymentRow>) => {
    setPaymentsTouched(true)
    setPayments((ps) => ps.map((x) => (x.id === mid ? { ...x, ...p } : x)))
  }
  const methodLabel = (m: PaymentMethod) =>
    (
      ({
        [PaymentMethod.CASH]: t('recv.pmCash'),
        [PaymentMethod.MTN_MOMO]: t('recv.pmMtn'),
        [PaymentMethod.ORANGE_MONEY]: t('recv.pmOrange'),
        [PaymentMethod.CARD]: t('recv.pmCard'),
      }) as Record<string, string>
    )[m] ?? m

  // --- submit ---
  const save = useMutation({
    mutationFn: () =>
      dataClient.inventory.restock(
        buildRestockInput({
          purchaseOrderId: poId,
          supplierId: supplierId ?? null,
          reference,
          items: built.items,
          subtotal: built.subtotal,
          charges,
          discounts,
          payments,
          invoiceNumber,
          invoiceDate,
          invoiceFileUrl,
          fallbackChargeName: t('recv.customCharge'),
          fallbackDiscountName: t('recv.discountLine'),
        }),
      ),
    onSuccess: () => {
      localStorage.removeItem(DRAFT_KEY)
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      void qc.invalidateQueries({ queryKey: queryKeys.inventory })
      void qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders })
      navigate('/inventory')
    },
    onError: (e) => setError(errorMessage(e, t('recv.error'))),
  })

  // --- step validation + navigation ---
  const validateStep = (i: number): string | null => {
    if (i === 0 && built.items.length === 0) return t('recv.nothing')
    if (i === 1) {
      if (totals.credit > 0 && !supplierId) return t('recv.supplierRequired')
      if (totals.credit > 0 && !invoiceFileUrl) return t('recv.invoiceRequired')
    }
    return null
  }
  const goNext = () => {
    const err = validateStep(step)
    if (err) return setError(err)
    setError(null)
    const next = Math.min(step + 1, 2)
    setStep(next)
    setMaxReached((m) => Math.max(m, next))
  }
  const goPrev = () => {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }
  const goStep = (i: number) => {
    if (i <= maxReached) {
      setError(null)
      setStep(i)
    }
  }
  const submit = () => {
    for (let i = 0; i < 3; i++) {
      const err = validateStep(i)
      if (err) {
        setStep(i)
        return setError(err)
      }
    }
    setError(null)
    save.mutate()
  }
  const isLast = step === 2
  useStepKeys({
    enabled: !quickOpen,
    onNext: () => (isLast ? submit() : goNext()),
    onPrev: goPrev,
    onConfirm: submit,
  })

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setLines([])
    setGroups({})
    setMeta({})
    setDraftRestored(false)
    setStep(0)
    setMaxReached(0)
  }

  const detachPo = () => {
    setPoId(null)
    setPoNumber(null)
    setPoSupplierId(null)
    setPoSupplierName(null)
  }

  const asLine = (ml: Line): LocalPurchaseOrderItem => ({
    id: ml.id,
    productId: ml.productId,
    variantId: null,
    description: ml.name,
    quantity: 0,
    unitPrice: 0,
    receivedQuantity: 0,
  })

  const steps = [
    {
      key: 'items',
      label: t('recv.stepItems'),
      hint: t('recv.itemsCount').replace('{n}', String(lines.length)),
    },
    { key: 'settle', label: t('recv.stepSettle'), hint: t('recv.stepSettleHint') },
    { key: 'review', label: t('recv.stepReview'), hint: money.format(totals.total) },
  ]

  return (
    <div className="frame">
      <div className="detail-top">
        <BackButton onClick={() => navigate('/inventory')}>{t('nav.inventory')}</BackButton>
      </div>

      <div className="page-head">
        <div>
          <h1>{t('recv.stockTitle')}</h1>
          <p>{t('recv.wizSub')}</p>
        </div>
      </div>

      {draftRestored ? (
        <div className="form-note" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <span>{t('recv.draftFound')}</span>
          <button type="button" className="gallery-add" onClick={discardDraft}>
            {t('recv.draftDiscard')}
          </button>
        </div>
      ) : null}

      <Stepper steps={steps} current={step} maxReached={maxReached} onStepClick={goStep} />

      <div style={{ marginTop: 16 }}>
        {/* STEP 1 — ITEMS */}
        {step === 0 ? (
          <div>
            <div className="fsec-h">{t('recv.itemsTitle')}</div>
            <p className="hint" style={{ marginTop: 4, marginBottom: 12 }}>
              {t('recv.itemsDesc')}
            </p>

            {poNumber ? (
              <div
                className="form-note"
                style={{ marginBottom: 12, justifyContent: 'space-between' }}
              >
                <span>{t('recv.poBanner').replace('{number}', poNumber)}</span>
                <button type="button" className="gallery-add" onClick={detachPo}>
                  {t('recv.poDetach')}
                </button>
              </div>
            ) : null}

            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <label className="lbl2">{t('recv.addExisting')}</label>
                  <CommandSelect
                    value={null}
                    valueLabel={null}
                    onChange={(id, opt) => void addProduct(id, opt?.label)}
                    loadOptions={loadProducts}
                    placeholder={t('field.addProduct')}
                    searchPlaceholder={t('field.searchProducts')}
                  />
                </div>
                <Button variant="soft" type="button" onClick={() => setQuickOpen(true)}>
                  {t('recv.createNew')}
                </Button>
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                {t('recv.createNewHint')}
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="recv-line">
                <div className="sub">{t('recv.itemsEmpty')}</div>
              </div>
            ) : (
              lines.map((ml) =>
                meta[ml.productId] ? (
                  <ReceiveLine
                    key={ml.id}
                    line={asLine(ml)}
                    product={meta[ml.productId]!.product}
                    variants={meta[ml.productId]!.variants}
                    groups={groups[ml.id] ?? []}
                    onChange={(g) => setGroups((s) => ({ ...s, [ml.id]: g }))}
                    manual
                    onRemoveLine={() => removeLine(ml.id)}
                  />
                ) : null,
              )
            )}
          </div>
        ) : null}

        {/* STEP 2 — SUPPLIER & PAYMENT */}
        {step === 1 ? (
          <div className="card">
            <div className="fsec-h">{t('recv.settleTitle')}</div>
            <p className="hint" style={{ marginTop: 4, marginBottom: 14 }}>
              {t('recv.settleDesc')}
            </p>

            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('recv.supplier')}</label>
              {allowSupplierPick ? (
                <CommandSelect
                  value={supplierId}
                  valueLabel={supplierName}
                  onChange={(id, opt) => {
                    setSupplierId(id)
                    setSupplierName(opt?.label ?? null)
                    setError(null)
                  }}
                  loadOptions={loadSuppliers}
                  placeholder={t('recv.pickSupplier')}
                  searchPlaceholder={t('field.searchSuppliers')}
                />
              ) : (
                <div
                  className="input"
                  style={{ display: 'flex', alignItems: 'center', background: 'var(--inset)' }}
                >
                  {poSupplierName ?? '—'}
                </div>
              )}
              <div className="hint" style={{ marginTop: 4 }}>
                {t('recv.supplierHint')}
              </div>
            </div>

            {/* Charges & discounts */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <div className="fsec-h" style={{ marginBottom: 0 }}>
                {t('recv.adjustments')}
              </div>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  addFromMenu(e.target.value)
                  e.currentTarget.value = ''
                }}
                style={{ height: 32, maxWidth: 150 }}
              >
                <option value="" disabled>
                  {t('recv.add')}
                </option>
                <optgroup label={t('recv.charges')}>
                  {chargeTypes.map((ct) => (
                    <option key={ct.id} value={`ct:${ct.id}`}>
                      {ct.name}
                    </option>
                  ))}
                  <option value="custom">{t('recv.customCharge')}</option>
                </optgroup>
                <optgroup label={t('recv.discounts')}>
                  <option value="discount">{t('recv.discountLine')}</option>
                </optgroup>
              </select>
            </div>
            <div className="hint" style={{ marginBottom: 10 }}>
              {t('recv.adjustmentsHint')}
            </div>

            {charges.map((c) => (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
              >
                <Input
                  value={c.name}
                  placeholder={t('recv.chargeNamePh')}
                  onChange={(e) => patchCharge(c.id, { name: e.target.value })}
                  disabled={!!c.chargeTypeId}
                  style={{ flex: 1, height: 30, minWidth: 0 }}
                />
                <button
                  type="button"
                  className="seg-toggle"
                  onClick={() =>
                    patchCharge(c.id, { rateType: c.rateType === 'PERCENT' ? 'FIXED' : 'PERCENT' })
                  }
                  style={{ height: 30, minWidth: 34 }}
                >
                  {c.rateType === 'PERCENT' ? '%' : money.symbol}
                </button>
                <Input
                  value={c.value}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => patchCharge(c.id, { value: e.target.value })}
                  style={{ width: 76, height: 30, textAlign: 'right' }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('recv.removeLine')}
                  onClick={() => setCharges((cs) => cs.filter((x) => x.id !== c.id))}
                  style={{ width: 28, height: 28 }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    style={{ width: 14, height: 14 }}
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            ))}
            {discounts.map((d) => (
              <div
                key={d.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
              >
                <Input
                  value={d.description}
                  placeholder={t('recv.discountDescPh')}
                  onChange={(e) => patchDiscount(d.id, { description: e.target.value })}
                  style={{ flex: 1, height: 30, minWidth: 0 }}
                />
                <button
                  type="button"
                  className="seg-toggle"
                  onClick={() =>
                    patchDiscount(d.id, {
                      discountType: d.discountType === 'PERCENTAGE' ? 'FIXED_AMOUNT' : 'PERCENTAGE',
                    })
                  }
                  style={{ height: 30, minWidth: 34 }}
                >
                  {d.discountType === 'PERCENTAGE' ? '%' : money.symbol}
                </button>
                <Input
                  value={d.value}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => patchDiscount(d.id, { value: e.target.value })}
                  style={{ width: 76, height: 30, textAlign: 'right' }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('recv.removeLine')}
                  onClick={() => setDiscounts((ds) => ds.filter((x) => x.id !== d.id))}
                  style={{ width: 28, height: 28 }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    style={{ width: 14, height: 14 }}
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Totals */}
            <div style={{ marginTop: 10 }}>
              <div className="recv-tot">
                <span style={{ color: 'var(--text-2)' }}>{t('recv.subtotal')}</span>
                <span>{money.format(built.subtotal)}</span>
              </div>
              {totals.discountAmount > 0 ? (
                <div className="recv-tot">
                  <span className="neg">{t('recv.discounts')}</span>
                  <span className="neg">−{money.format(totals.discountAmount)}</span>
                </div>
              ) : null}
              {totals.chargesAmount > 0 ? (
                <div className="recv-tot">
                  <span style={{ color: 'var(--text-2)' }}>{t('recv.charges')}</span>
                  <span>+{money.format(totals.chargesAmount)}</span>
                </div>
              ) : null}
              <div className="recv-tot grand">
                <span>{t('recv.invoiceTotal')}</span>
                <span>{money.format(totals.total)}</span>
              </div>
            </div>

            {/* Payment */}
            <div className="fsec-h" style={{ marginTop: 16, marginBottom: 6 }}>
              {t('recv.payments')}
            </div>
            <div className="hint" style={{ marginBottom: 8 }}>
              {t('recv.paymentsHint')}
            </div>
            <div className="pm-chips">
              {TENDERS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`pm-chip${payments.some((p) => p.method === m) ? ' active' : ''}`}
                  onClick={() => toggleMethod(m)}
                >
                  {methodLabel(m)}
                </button>
              ))}
            </div>
            {payments.map((p) => (
              <div key={p.id} className="pay-row">
                <span className="pm-name">{methodLabel(p.method)}</span>
                {isMomo(p.method) ? (
                  <Input
                    value={p.momoRef}
                    placeholder={t('recv.momoRef')}
                    onChange={(e) => setPayment(p.id, { momoRef: e.target.value })}
                    style={{ width: 120, height: 32 }}
                  />
                ) : null}
                <Input
                  value={p.amount}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => setPayment(p.id, { amount: e.target.value })}
                  style={{ width: 110, height: 32, textAlign: 'right' }}
                />
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <div className="recv-tot">
                <span style={{ color: 'var(--text-2)' }}>{t('recv.paid')}</span>
                <span>{money.format(totals.paid)}</span>
              </div>
              {totals.credit > 0 ? (
                <div className="recv-tot">
                  <span className="neg" style={{ fontWeight: 700 }}>
                    {t('recv.credit')}
                  </span>
                  <span className="neg" style={{ fontWeight: 700 }}>
                    {money.format(totals.credit)}
                  </span>
                </div>
              ) : null}
              {totals.overpaid > 0 ? (
                <div className="recv-tot">
                  <span style={{ fontWeight: 700 }}>{t('recv.overpaid')}</span>
                  <span style={{ fontWeight: 700 }}>{money.format(totals.overpaid)}</span>
                </div>
              ) : null}
            </div>
            {totals.credit > 0 ? (
              <div className="hint" style={{ marginTop: 6 }}>
                {t('recv.creditNote')}
              </div>
            ) : null}

            {/* Supplier invoice */}
            <div className="fsec-h" style={{ marginTop: 16, marginBottom: 8 }}>
              {t('recv.invoiceSection')}
              {totals.credit > 0 ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
            </div>
            <div className="form-2col">
              <div className="ff">
                <label className="lbl2">{t('recv.invoiceNumber')}</label>
                <Input
                  value={invoiceNumber}
                  placeholder={t('recv.invoiceNumberPh')}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div className="ff">
                <label className="lbl2">{t('recv.invoiceDate')}</label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>
            <div className="ff" style={{ marginTop: 10 }}>
              <FileUpload
                value={invoiceFileUrl}
                onChange={(u) => {
                  setInvoiceFileUrl(u)
                  setError(null)
                }}
                folder="invoices"
                variant="file"
                hint={t('recv.invoiceHint')}
              />
            </div>

            <div className="ff" style={{ marginTop: 14 }}>
              <label className="lbl2">{t('recv.reference')}</label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
        ) : null}

        {/* STEP 3 — REVIEW */}
        {step === 2 ? (
          <div className="card">
            <div className="fsec-h">{t('recv.reviewTitle')}</div>
            <p className="hint" style={{ marginTop: 4, marginBottom: 14 }}>
              {t('recv.reviewDesc')}
            </p>

            <div className="fsec-h" style={{ marginBottom: 8 }}>
              {t('recv.reviewItems')}
            </div>
            {built.items.map((it, i) => {
              const m = meta[it.productId]
              const vName = m?.variants.find((v) => v.id === it.variantId)?.name
              const qty = it.serialNumbers ? it.serialNumbers.length : (it.quantity ?? 0)
              return (
                <div key={`${it.productId}-${it.variantId ?? 'base'}-${i}`} className="recv-tot">
                  <span>
                    {m?.product.name ?? '—'}
                    {vName ? ` · ${vName}` : ''}{' '}
                    <span style={{ color: 'var(--text-2)' }}>× {qty}</span>
                  </span>
                  <span>{money.format(round2(qty * (it.unitCost ?? 0)))}</span>
                </div>
              )
            })}

            <div style={{ marginTop: 12 }}>
              <div className="recv-tot">
                <span style={{ color: 'var(--text-2)' }}>{t('recv.subtotal')}</span>
                <span>{money.format(built.subtotal)}</span>
              </div>
              {totals.discountAmount > 0 ? (
                <div className="recv-tot">
                  <span className="neg">{t('recv.discounts')}</span>
                  <span className="neg">−{money.format(totals.discountAmount)}</span>
                </div>
              ) : null}
              {totals.chargesAmount > 0 ? (
                <div className="recv-tot">
                  <span style={{ color: 'var(--text-2)' }}>{t('recv.charges')}</span>
                  <span>+{money.format(totals.chargesAmount)}</span>
                </div>
              ) : null}
              <div className="recv-tot grand">
                <span>{t('recv.invoiceTotal')}</span>
                <span>{money.format(totals.total)}</span>
              </div>
              <div className="recv-tot">
                <span style={{ color: 'var(--text-2)' }}>{t('recv.paid')}</span>
                <span>{money.format(totals.paid)}</span>
              </div>
              {totals.credit > 0 ? (
                <div className="recv-tot">
                  <span className="neg" style={{ fontWeight: 700 }}>
                    {t('recv.credit')}
                  </span>
                  <span className="neg" style={{ fontWeight: 700 }}>
                    {money.format(totals.credit)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="recv-tot" style={{ marginTop: 10 }}>
              <span style={{ color: 'var(--text-2)' }}>{t('recv.supplier')}</span>
              <span>{supplierName ?? poSupplierName ?? t('recv.reviewNoSupplier')}</span>
            </div>
            {totals.credit > 0 ? (
              <div className="hint" style={{ marginTop: 8, color: 'var(--danger)' }}>
                {t('recv.reviewCreditWarn')
                  .replace('{amount}', money.format(totals.credit))
                  .replace('{supplier}', supplierName ?? poSupplierName ?? '')}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      {/* Footer nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginTop: 18,
          flexWrap: 'wrap',
        }}
      >
        <span className="hint">{t('recv.keysHint')}</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            variant="soft"
            type="button"
            onClick={step === 0 ? () => navigate('/inventory') : goPrev}
            disabled={save.isPending}
          >
            {step === 0 ? t('recv.cancel') : t('recv.back')}
          </Button>
          {isLast ? (
            <Button variant="primary" type="button" loading={save.isPending} onClick={submit}>
              {t('recv.confirm').replace('{v}', money.format(totals.total))}
            </Button>
          ) : (
            <Button variant="primary" type="button" onClick={goNext}>
              {t('recv.next')}
            </Button>
          )}
        </div>
      </div>

      <QuickCreateProduct
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onCreated={(product, cost) => void addProduct(product.id, product.name, cost)}
      />
    </div>
  )
}
