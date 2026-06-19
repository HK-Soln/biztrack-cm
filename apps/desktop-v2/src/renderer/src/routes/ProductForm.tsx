import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Select, Stepper } from '@biztrack/ui/biztrack'
import type { CommandSelectOption, StepperStep } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { SERIAL_TYPES, validateSerial } from '@/lib/serial'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import type {
  ProductImageInput,
  ProductInput,
  ProductType,
  SerialType,
  SerialUnitInput,
  VariantInput,
} from '@shared/ipc'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const TVA_RATE = 19.25
const PRODUCT_TYPES: ProductType[] = ['SIMPLE', 'SERVICE', 'VARIABLE_QUANTITY', 'COMPOSITE']
const DRAFT_KEY = 'biztrack:product-draft:new'

const sigOf = (optionIds: string[]) => [...optionIds].sort().join('|')

type StepKey = 'basics' | 'pricing' | 'variants' | 'stock' | 'online' | 'media'

interface DraftOption {
  attributeGroupId: string
  attributeOptionId: string
  groupName: string
  value: string
  colorHex?: string | null
}
interface DraftVariant {
  key: string
  options: DraftOption[]
  price: string
  cost: string
  stock: string
  serials: string[]
  active: boolean
}
interface Draft {
  step: number
  name: string
  description: string
  brandId: string
  brandLabel: string | null
  categoryId: string
  categoryLabel: string | null
  modelId: string
  modelLabel: string | null
  sku: string
  barcode: string
  productType: ProductType
  unitId: string
  unitLabel: string | null
  cost: string
  price: string
  taxable: boolean
  isSerialized: boolean
  serialType: SerialType
  warrantyMonths: string
  variants: DraftVariant[]
  productSerials: string[]
  openingStock: string
  reorderPoint: string
  lowStockThreshold: string
  publishOnline: boolean
  onlineDescription: string
  onlineReserve: string
  metaTitle: string
  metaDescription: string
  imageUrl: string | null
  gallery: ProductImageInput[]
  isActive: boolean
  isFeatured: boolean
}

const DEFAULT_DRAFT: Draft = {
  step: 0,
  name: '',
  description: '',
  brandId: '',
  brandLabel: null,
  categoryId: '',
  categoryLabel: null,
  modelId: '',
  modelLabel: null,
  sku: '',
  barcode: '',
  productType: 'SIMPLE',
  unitId: '',
  unitLabel: null,
  cost: '',
  price: '',
  taxable: true,
  isSerialized: false,
  serialType: 'IMEI',
  warrantyMonths: '',
  variants: [],
  productSerials: [],
  openingStock: '',
  reorderPoint: '',
  lowStockThreshold: '',
  publishOnline: false,
  onlineDescription: '',
  onlineReserve: '',
  metaTitle: '',
  metaDescription: '',
  imageUrl: null,
  gallery: [],
  isActive: true,
  isFeatured: false,
}

type Patch = Partial<Draft> | ((s: Draft) => Partial<Draft>)
function reducer(state: Draft, patch: Patch): Draft {
  return { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return { ...DEFAULT_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) }
  } catch {
    return null
  }
}

// Multi-step add/edit product wizard (Basics → Pricing → Variants → Stock →
// Online → Media). New-product drafts persist to localStorage so a refresh
// resumes the step + entered data. Manual variant builder (pick one option per
// attribute group, confirm) + per-variant/product serial numbers when serialized.
export function ProductForm() {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const qc = useQueryClient()

  const initial = useRef<Draft>(editing ? DEFAULT_DRAFT : readDraft() ?? DEFAULT_DRAFT).current
  const [d, patch] = useReducer(reducer, initial)
  const [draftRestored, setDraftRestored] = useState(() => !editing && readDraft() != null)
  const [maxReached, setMaxReached] = useState(initial.step)

  // Persist new-product drafts on every change so a refresh resumes seamlessly.
  useEffect(() => {
    if (editing) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [d, editing])

  const [error, setError] = useState<string | null>(null)
  const [varError, setVarError] = useState<string | null>(null)
  const [builderSel, setBuilderSel] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const loadedRef = useRef(false)
  const galleryLoadedRef = useRef(false)
  const variantsLoadedRef = useRef(false)

  // --- data loads -----------------------------------------------------------
  const { data: existing } = useQuery({
    queryKey: [...queryKeys.products, 'one', id],
    queryFn: () => dataClient.products.get(id!),
    enabled: isElectron && editing,
  })
  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: isElectron,
  })
  const { data: selectedBrand } = useQuery({
    queryKey: [...queryKeys.brands, 'one', d.brandId],
    queryFn: () => dataClient.brands.get(d.brandId),
    enabled: isElectron && !!d.brandId,
  })
  const { data: existingImages } = useQuery({
    queryKey: [...queryKeys.products, 'images', id],
    queryFn: () => dataClient.products.listImages(id!),
    enabled: isElectron && editing,
  })
  const { data: categoryLinks = [] } = useQuery({
    queryKey: queryKeys.categoryAttributeLinks(d.categoryId || 'none'),
    queryFn: () => dataClient.attributes.listCategoryLinks(d.categoryId),
    enabled: isElectron && !!d.categoryId,
  })
  const { data: existingVariants } = useQuery({
    queryKey: [...queryKeys.products, 'variants', id],
    queryFn: () => dataClient.products.listVariants(id!),
    enabled: isElectron && editing,
  })
  const { data: existingSerials } = useQuery({
    queryKey: [...queryKeys.products, 'serials', id],
    queryFn: () => dataClient.products.listSerialUnits(id!),
    enabled: isElectron && editing,
  })

  // --- editing: seed scalars once -------------------------------------------
  useEffect(() => {
    if (!editing || loadedRef.current || !existing) return
    loadedRef.current = true
    patch({
      name: existing.name,
      description: existing.description ?? '',
      brandId: existing.brandId ?? '',
      brandLabel: existing.brandName,
      categoryId: existing.categoryId ?? '',
      categoryLabel: existing.categoryName,
      modelId: existing.modelId ?? '',
      sku: existing.sku ?? '',
      barcode: existing.barcode ?? '',
      cost: existing.costPrice != null ? String(existing.costPrice) : '',
      price: String(existing.sellingPrice),
      taxable: (existing.taxRate ?? 0) > 0,
      productType: existing.productType,
      unitId: existing.unitOfMeasureId ?? '',
      unitLabel: existing.unitAbbr,
      imageUrl: existing.imageUrl,
      isActive: existing.isActive,
      isFeatured: existing.isFeatured,
      reorderPoint: existing.reorderPoint != null ? String(existing.reorderPoint) : '',
      lowStockThreshold: existing.lowStockThreshold != null ? String(existing.lowStockThreshold) : '',
      publishOnline: existing.isPublishedOnline,
      onlineDescription: existing.onlineDescription ?? '',
      onlineReserve: existing.onlineStockReserve ? String(existing.onlineStockReserve) : '',
      metaTitle: existing.metaTitle ?? '',
      metaDescription: existing.metaDescription ?? '',
      isSerialized: existing.isSerialized,
      serialType: existing.serialType ?? 'IMEI',
      warrantyMonths: existing.warrantyMonths != null ? String(existing.warrantyMonths) : '',
    })
  }, [editing, existing])

  // --- editing: seed gallery once -------------------------------------------
  useEffect(() => {
    if (!editing || galleryLoadedRef.current || !existingImages) return
    galleryLoadedRef.current = true
    patch({ gallery: existingImages.map((g) => ({ id: g.id, url: g.url, altText: g.altText })) })
  }, [editing, existingImages])

  // --- editing: seed variants + serials once (needs category links for labels)
  useEffect(() => {
    if (!editing || variantsLoadedRef.current || !existingVariants || !existingSerials) return
    const hasVariantRows = existingVariants.length > 0
    if (hasVariantRows && categoryLinks.length === 0) return // wait for option labels
    variantsLoadedRef.current = true

    const serialsByVariant = new Map<string, string[]>()
    const productSerials: string[] = []
    for (const u of existingSerials) {
      if (u.variantId) {
        const list = serialsByVariant.get(u.variantId) ?? []
        list.push(u.serialNumber)
        serialsByVariant.set(u.variantId, list)
      } else {
        productSerials.push(u.serialNumber)
      }
    }

    const variants: DraftVariant[] = existingVariants.map((v) => ({
      key: sigOf(v.options.map((o) => o.attributeOptionId)),
      options: v.options.map((o) => {
        const g = categoryLinks.find((x) => x.attributeGroupId === o.attributeGroupId)
        const opt = g?.options.find((x) => x.id === o.attributeOptionId)
        return {
          attributeGroupId: o.attributeGroupId,
          attributeOptionId: o.attributeOptionId,
          groupName: g?.name ?? '',
          value: opt?.value ?? o.attributeOptionId,
          colorHex: opt?.colorHex ?? null,
        }
      }),
      price: v.priceOverride != null ? String(v.priceOverride) : '',
      cost: v.costPriceOverride != null ? String(v.costPriceOverride) : '',
      stock: String(v.stockQuantity ?? 0),
      serials: serialsByVariant.get(v.id) ?? [],
      active: v.isActive,
    }))
    patch({ variants, productSerials })
  }, [editing, existingVariants, existingSerials, categoryLinks])

  // When the brand resolves: auto-pick its sole category + resolve model label.
  useEffect(() => {
    if (!selectedBrand) return
    if (!d.categoryId && selectedBrand.categoryIds.length === 1) {
      const only = selectedBrand.categoryIds[0]!
      patch({ categoryId: only, categoryLabel: categories.find((c) => c.id === only)?.name ?? null })
    }
    if (d.modelId && !d.modelLabel) {
      patch({ modelLabel: selectedBrand.models.find((m) => m.id === d.modelId)?.name ?? null })
    }
  }, [selectedBrand, categories])

  // --- derived --------------------------------------------------------------
  const costN = Number(d.cost.replace(/\s/g, '')) || 0
  const priceN = Number(d.price.replace(/\s/g, '')) || 0
  const marginPct = priceN > 0 && costN > 0 ? ((priceN - costN) / priceN) * 100 : null
  const tracksInventory = d.productType === 'SIMPLE' || d.productType === 'VARIABLE_QUANTITY'
  const canHaveVariants = d.productType === 'SIMPLE'
  const hasVariants = d.variants.length > 0
  const numOrU = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '')) : undefined)
  const numOrNull = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '')) : null)

  const stepKeys = useMemo<StepKey[]>(() => {
    const keys: StepKey[] = ['basics', 'pricing']
    if (canHaveVariants) keys.push('variants')
    if (tracksInventory) keys.push('stock')
    keys.push('online', 'media')
    return keys
  }, [canHaveVariants, tracksInventory])

  const step = Math.min(d.step, stepKeys.length - 1)
  const stepKey = stepKeys[step]!
  const isLast = step === stepKeys.length - 1
  const isFirst = step === 0

  const STEP_LABEL: Record<StepKey, string> = {
    basics: t('prodf.stepBasics'),
    pricing: t('prodf.stepPricing'),
    variants: t('prodf.stepVariants'),
    stock: t('prodf.stepStock'),
    online: t('prodf.stepOnline'),
    media: t('prodf.stepMedia'),
  }
  const STEP_SUB: Record<StepKey, string> = {
    basics: t('prodf.stepBasicsSub'),
    pricing: t('prodf.stepPricingSub'),
    variants: t('prodf.stepVariantsSub'),
    stock: t('prodf.stepStockSub'),
    online: t('prodf.stepOnlineSub'),
    media: t('prodf.stepMediaSub'),
  }
  const stepperSteps: StepperStep[] = stepKeys.map((k) => ({ key: k, label: STEP_LABEL[k] }))

  // --- loaders (search reaches SQLite/API, not just the loaded page) ---------
  const loadBrands = useCallback(
    (s: string) =>
      dataClient.brands.list({ search: s, limit: 20 }).then((r) => r.data.map((b) => ({ value: b.id, label: b.name }))),
    [],
  )
  const loadUnits = useCallback(
    (s: string) =>
      dataClient.units
        .list({ search: s, limit: 20 })
        .then((r) => r.data.map((u) => ({ value: u.id, label: u.abbreviation ? `${u.name} (${u.abbreviation})` : u.name }))),
    [],
  )
  const loadModels = useCallback(
    (s: string) => {
      const q = s.toLowerCase()
      const models = (selectedBrand?.models ?? []).filter((m) => m.name.toLowerCase().includes(q))
      return Promise.resolve(models.map((m) => ({ value: m.id, label: m.name })))
    },
    [selectedBrand],
  )
  const loadCategories = useCallback(
    (s: string) => {
      const q = s.toLowerCase()
      if (selectedBrand) {
        const ids = new Set(selectedBrand.categoryIds)
        return Promise.resolve(
          categories.filter((c) => ids.has(c.id) && c.name.toLowerCase().includes(q)).map((c) => ({ value: c.id, label: c.name })),
        )
      }
      return dataClient.categories.list({ search: s, depth: 3, limit: 20 }).then((r) => r.data.map((c) => ({ value: c.id, label: c.name })))
    },
    [selectedBrand, categories],
  )

  const onBrandChange = (value: string | null, option?: CommandSelectOption) =>
    patch({ brandId: value ?? '', brandLabel: option?.label ?? null, categoryId: '', categoryLabel: null, modelId: '', modelLabel: null })

  // --- variant builder ------------------------------------------------------
  const addVariant = () => {
    if (categoryLinks.length === 0) return
    if (categoryLinks.some((g) => !builderSel[g.attributeGroupId])) {
      setVarError(t('prodf.variantIncomplete'))
      return
    }
    const options: DraftOption[] = categoryLinks.map((g) => {
      const optId = builderSel[g.attributeGroupId]!
      const o = g.options.find((x) => x.id === optId)
      return { attributeGroupId: g.attributeGroupId, attributeOptionId: optId, groupName: g.name, value: o?.value ?? '?', colorHex: o?.colorHex ?? null }
    })
    const key = sigOf(options.map((o) => o.attributeOptionId))
    if (d.variants.some((v) => v.key === key)) {
      setVarError(t('prodf.variantDup'))
      return
    }
    patch((s) => ({ variants: [...s.variants, { key, options, price: '', cost: '', stock: '', serials: [], active: true }] }))
    setBuilderSel({})
    setVarError(null)
  }
  const updateVariant = (key: string, p: Partial<DraftVariant>) =>
    patch((s) => ({ variants: s.variants.map((v) => (v.key === key ? { ...v, ...p } : v)) }))
  const removeVariant = (key: string) => patch((s) => ({ variants: s.variants.filter((v) => v.key !== key) }))

  // --- image upload ---------------------------------------------------------
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return setImageError(t('prodf.imageTypeError'))
    setImageError(null)
    setUploading(true)
    try {
      const bytes = await file.arrayBuffer()
      const res = await dataClient.uploads.file({ bytes, filename: file.name, contentType: file.type, folder: 'products' })
      patch({ imageUrl: res.url })
    } catch {
      setImageError(t('prodf.imageError'))
    } finally {
      setUploading(false)
    }
  }
  async function onPickGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const valid = files.filter((f) => ALLOWED_IMAGE_TYPES.includes(f.type))
    if (valid.length === 0) return
    setUploading(true)
    try {
      for (const file of valid) {
        const bytes = await file.arrayBuffer()
        const res = await dataClient.uploads.file({ bytes, filename: file.name, contentType: file.type, folder: 'products' })
        patch((s) => ({ gallery: [...s.gallery, { url: res.url }] }))
      }
    } catch {
      setImageError(t('prodf.imageError'))
    } finally {
      setUploading(false)
    }
  }

  // --- validation + navigation ----------------------------------------------
  function stepError(key: StepKey): string | null {
    switch (key) {
      case 'basics':
        if (!d.name.trim()) return t('prodf.nameRequired')
        if (!d.unitId) return t('prodf.unitRequired')
        return null
      case 'pricing':
        if (priceN <= 0) return t('prodf.priceRequired')
        return null
      case 'variants':
        if (d.variants.length === 1) return t('prodf.variantsMinTwo')
        // Serials are only captured at creation; on edit they're managed on the detail page.
        if (!editing && d.isSerialized && hasVariants && d.variants.some((v) => v.serials.length === 0)) return t('prodf.variantSerialsRequired')
        return null
      case 'stock':
        if (!editing && d.isSerialized && !hasVariants && d.productSerials.length === 0) return t('prodf.serialsRequired')
        return null
      default:
        return null
    }
  }
  const goTo = (next: number) => {
    patch({ step: next })
    setMaxReached((m) => Math.max(m, next))
    setError(null)
  }
  const goNext = () => {
    const err = stepError(stepKey)
    if (err) return setError(err)
    goTo(step + 1)
  }
  const goPrev = () => (isFirst ? navigate('/products') : goTo(step - 1))

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    patch(DEFAULT_DRAFT)
    setMaxReached(0)
    setDraftRestored(false)
  }

  // --- save -----------------------------------------------------------------
  const save = useMutation({
    mutationFn: async () => {
      const input: ProductInput = {
        name: d.name.trim(),
        description: d.description.trim() || null,
        sku: d.sku.trim() || null,
        barcode: d.barcode.trim() || null,
        sellingPrice: priceN,
        costPrice: d.cost.trim() ? costN : null,
        taxRate: d.taxable ? TVA_RATE : 0,
        unitOfMeasureId: d.unitId,
        categoryId: d.categoryId || null,
        brandId: d.brandId || null,
        modelId: d.modelId || null,
        metaTitle: d.metaTitle.trim() || null,
        metaDescription: d.metaDescription.trim() || null,
        imageUrl: d.imageUrl,
        productType: d.productType,
        isService: d.productType === 'SERVICE',
        isActive: d.isActive,
        isFeatured: d.isFeatured,
        isPublishedOnline: d.publishOnline,
        onlineDescription: d.onlineDescription.trim() || null,
        onlineStockReserve: numOrU(d.onlineReserve) ?? 0,
        isSerialized: tracksInventory ? d.isSerialized : false,
        serialType: tracksInventory && d.isSerialized ? d.serialType : null,
        warrantyMonths: tracksInventory && d.isSerialized ? numOrU(d.warrantyMonths) ?? null : null,
        // Stock is owned by variants when present, and by serial-unit count when serialized.
        openingStock: tracksInventory && !hasVariants && !d.isSerialized ? numOrU(d.openingStock) ?? 0 : 0,
        lowStockThreshold: tracksInventory ? numOrU(d.lowStockThreshold) ?? null : null,
        reorderPoint: tracksInventory ? numOrU(d.reorderPoint) ?? null : null,
      }
      const saved = editing && id ? await dataClient.products.update(id, input) : await dataClient.products.create(input)
      await dataClient.products.setImages(saved.id, d.gallery)

      // Variants are captured only at CREATION. After creation they're managed from
      // the detail page (add/edit/remove), each writing a stock movement.
      if (!editing && canHaveVariants) {
        const variantInputs: VariantInput[] = d.variants.map((v) => ({
          name: v.options.map((o) => o.value).join(' / '),
          priceOverride: numOrNull(v.price),
          costPriceOverride: numOrNull(v.cost),
          openingStock: d.isSerialized ? 0 : numOrU(v.stock) ?? 0,
          isActive: v.active,
          options: v.options.map((o) => ({ attributeGroupId: o.attributeGroupId, attributeOptionId: o.attributeOptionId })),
        }))
        await dataClient.products.setVariants(saved.id, variantInputs)
      }

      // Serial units are captured only at CREATION (the product's opening stock).
      // After creation they're managed from the detail page (add/retire/correct),
      // each writing a stock movement — so editing never touches them here.
      if (!editing && tracksInventory && d.isSerialized) {
        const units: SerialUnitInput[] = []
        if (hasVariants) {
          const live = await dataClient.products.listVariants(saved.id)
          const idBySig = new Map(live.map((v) => [sigOf(v.options.map((o) => o.attributeOptionId)), v.id]))
          for (const v of d.variants) {
            const variantId = idBySig.get(v.key) ?? null
            for (const sn of v.serials) units.push({ variantId, serialNumber: sn, serialType: d.serialType })
          }
        } else {
          for (const sn of d.productSerials) units.push({ variantId: null, serialNumber: sn, serialType: d.serialType })
        }
        await dataClient.products.setSerialUnits(saved.id, units)
      }
      return saved
    },
    onSuccess: () => {
      if (!editing) {
        try {
          localStorage.removeItem(DRAFT_KEY)
        } catch {
          /* ignore */
        }
      }
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      navigate('/products')
    },
    onError: () => setError(t('prodf.saveError')),
  })

  const submit = () => {
    for (let i = 0; i < stepKeys.length; i++) {
      const err = stepError(stepKeys[i]!)
      if (err) {
        patch({ step: i })
        return setError(err)
      }
    }
    setError(null)
    save.mutate()
  }

  // --- render ---------------------------------------------------------------
  return (
    <div className="frame">
      <div className="detail-top">
        <button type="button" className="back-btn" onClick={() => navigate('/products')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 3-5 5 5 5" />
            <path d="M2 8h12" />
          </svg>
          {t('prodf.back')}
        </button>
      </div>

      <div className="page-head wiz-head">
        <div>
          <h1>{editing ? t('prodf.editTitle') : t('prodf.addTitle')}</h1>
          <p>{t('prodf.subtitle')}</p>
        </div>
      </div>

      {draftRestored ? (
        <div className="form-note" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
            {t('prodf.draftFound')}
          </span>
          <button type="button" className="gallery-add" onClick={discardDraft}>{t('prodf.draftDiscard')}</button>
        </div>
      ) : null}

      <div className="card">
        <Stepper steps={stepperSteps} current={step} maxReached={maxReached} onStepClick={(i) => goTo(i)} />

        <div className="wiz-body" style={{ marginTop: 22 }}>
          <h2 className="wiz-step-title">{STEP_LABEL[stepKey]}</h2>
          <p className="wiz-step-sub">{STEP_SUB[stepKey]}</p>

          {stepKey === 'basics' ? (
            <div className="fform">
              <div className="ff">
                <label className="lbl2">{t('prodf.name')} <span className="req">*</span></label>
                <Input value={d.name} placeholder={t('prodf.namePh')} onChange={(e) => { patch({ name: e.target.value }); setError(null) }} error={!!error && !d.name.trim()} />
              </div>
              <div className="ff">
                <label className="lbl2">{t('prodf.type')}</label>
                <div className="seg-pick">
                  {PRODUCT_TYPES.map((pt) => (
                    <button key={pt} type="button" aria-pressed={pt === d.productType} onClick={() => patch({ productType: pt })}>
                      {t(`prodf.type_${pt}` as Parameters<typeof t>[0])}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-2col">
                <div className="ff">
                  <label className="lbl2">{t('prodf.brand')}</label>
                  <CommandSelect value={d.brandId || null} valueLabel={d.brandLabel} onChange={onBrandChange} loadOptions={loadBrands} placeholder={t('prodf.brandNone')} searchPlaceholder={t('prodf.searchBrands')} clearLabel={t('prodf.brandNone')} />
                  <div className="hint">{t('prodf.brandHint')}</div>
                </div>
                <div className="ff">
                  <label className="lbl2">{t('prodf.category')}</label>
                  <CommandSelect value={d.categoryId || null} valueLabel={d.categoryLabel} onChange={(v, o) => patch({ categoryId: v ?? '', categoryLabel: o?.label ?? null })} loadOptions={loadCategories} placeholder={t('prodf.categoryNone')} searchPlaceholder={t('prodf.searchCategories')} clearLabel={t('prodf.categoryNone')} />
                </div>
              </div>
              <div className="form-2col">
                <div className="ff">
                  <label className="lbl2">{t('prodf.model')}</label>
                  <CommandSelect value={d.modelId || null} valueLabel={d.modelLabel} onChange={(v, o) => patch({ modelId: v ?? '', modelLabel: o?.label ?? null })} loadOptions={loadModels} placeholder={selectedBrand ? t('prodf.modelPick') : t('prodf.modelNoBrand')} searchPlaceholder={t('prodf.searchModels')} emptyText={t('prodf.modelNone')} clearLabel={t('prodf.modelClear')} disabled={!selectedBrand} />
                </div>
                <div className="ff">
                  <label className="lbl2">{t('prodf.unit')} <span className="req">*</span></label>
                  <CommandSelect value={d.unitId || null} valueLabel={d.unitLabel} onChange={(v, o) => { patch({ unitId: v ?? '', unitLabel: o?.label ?? null }); setError(null) }} loadOptions={loadUnits} placeholder={t('prodf.unitPick')} searchPlaceholder={t('prodf.searchUnits')} invalid={!!error && !d.unitId} />
                </div>
              </div>
              <div className="form-2col">
                <div className="ff">
                  <label className="lbl2">{t('prodf.sku')}</label>
                  <Input value={d.sku} placeholder={t('prodf.skuPh')} onChange={(e) => patch({ sku: e.target.value })} />
                </div>
                <div className="ff">
                  <label className="lbl2">{t('prodf.barcode')}</label>
                  <Input value={d.barcode} placeholder={t('prodf.barcodePh')} onChange={(e) => patch({ barcode: e.target.value })} />
                </div>
              </div>
              <div className="ff">
                <label className="lbl2">{t('prodf.description')} <span className="opt">{t('prodf.optional')}</span></label>
                <textarea className="input" rows={2} style={{ resize: 'vertical', paddingTop: 10 }} placeholder={t('prodf.descriptionPh')} value={d.description} onChange={(e) => patch({ description: e.target.value })} />
              </div>
            </div>
          ) : null}

          {stepKey === 'pricing' ? (
            <div className="fform">
              <div className="form-2col">
                <div className="ff">
                  <label className="lbl2">{t('prodf.cost')}</label>
                  <Input value={d.cost} inputMode="decimal" placeholder="0" onChange={(e) => patch({ cost: e.target.value })} />
                </div>
                <div className="ff">
                  <label className="lbl2">{t('prodf.price')} <span className="req">*</span></label>
                  <Input value={d.price} inputMode="decimal" placeholder="0" onChange={(e) => { patch({ price: e.target.value }); setError(null) }} error={!!error && priceN <= 0} />
                </div>
              </div>
              <div className="calc-row">
                <span>{t('prodf.margin')}</span>
                <span>
                  <span className="big">{marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}</span>
                  {marginPct != null ? <> · {money.format(priceN - costN)}</> : null}
                </span>
              </div>
              <button type="button" className={`switch-line${d.taxable ? ' on' : ''}`} onClick={() => patch({ taxable: !d.taxable })} aria-pressed={d.taxable}>
                <span className={`switch${d.taxable ? ' on' : ''}`} />
                <span>{t('prodf.taxable')}</span>
              </button>
            </div>
          ) : null}

          {stepKey === 'variants' ? (
            <div className="fform">
              <div className="card" style={{ background: 'var(--inset)', padding: 14 }}>
                <div className="set-line" style={{ paddingTop: 0, borderBottom: d.isSerialized ? '1px solid var(--border)' : 0 }}>
                  <div className="t">
                    <div className="nm">{t('prodf.serialized')}</div>
                    <div className="ds">{t('prodf.serializedHint')}</div>
                  </div>
                  <button type="button" className={`switch${d.isSerialized ? ' on' : ''}`} aria-pressed={d.isSerialized} onClick={() => patch({ isSerialized: !d.isSerialized })} />
                </div>
                {d.isSerialized ? (
                  <div className="form-2col" style={{ marginTop: 12 }}>
                    <div className="ff">
                      <label className="lbl2">{t('prodf.serialType')}</label>
                      <div className="seg-pick">
                        {SERIAL_TYPES.map((st) => (
                          <button key={st} type="button" aria-pressed={st === d.serialType} onClick={() => patch({ serialType: st })}>
                            {t(`prodf.serial_${st}` as Parameters<typeof t>[0])}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ff">
                      <label className="lbl2">{t('prodf.warranty')}</label>
                      <Input value={d.warrantyMonths} inputMode="numeric" placeholder="0" onChange={(e) => patch({ warrantyMonths: e.target.value })} />
                    </div>
                  </div>
                ) : null}
              </div>

              {editing ? (
                <div className="form-note"><span>{t('prodf.variantsManageHint')}</span></div>
              ) : (
              <>
              <div className="form-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
                <span>{t('prodf.variantSingleHint')}</span>
              </div>

              {!d.categoryId ? (
                <div className="form-note"><span>{t('prodf.variantsPickCategory')}</span></div>
              ) : categoryLinks.length === 0 ? (
                <div className="form-note"><span>{t('prodf.variantsNoGroups')}</span></div>
              ) : (
                <>
                  <div className="vbuilder">
                    <div className="lbl2" style={{ marginBottom: 8 }}>{t('prodf.variantBuild')}</div>
                    <div className="vbuilder-grid">
                      {categoryLinks.map((g) => (
                        <div className="ff" key={g.id} style={{ margin: 0 }}>
                          <label className="lbl2">{g.name}</label>
                          <Select
                            value={builderSel[g.attributeGroupId] ?? ''}
                            onChange={(e) => { setBuilderSel((p) => ({ ...p, [g.attributeGroupId]: e.target.value })); setVarError(null) }}
                          >
                            <option value="">{t('prodf.variantPick')}</option>
                            {g.options.map((o) => (
                              <option key={o.id} value={o.id}>{o.value}</option>
                            ))}
                          </Select>
                        </div>
                      ))}
                    </div>
                    <div className="vbuilder-acts">
                      <Button type="button" variant="primary" onClick={addVariant}>+ {t('prodf.variantAdd')}</Button>
                    </div>
                    {varError ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">{varError}</p> : null}
                  </div>

                  {d.variants.length === 0 ? (
                    <div className="form-note"><span>{t('prodf.variantNone')}</span></div>
                  ) : (
                    <div className="vlist">
                      {d.variants.map((v) => (
                        <div key={v.key} className="vcard">
                          <div className="vcard-top">
                            <span className="vcard-name">
                              {v.options.map((o) => (
                                <span className="vopt-chip" key={o.attributeGroupId}>
                                  {o.colorHex ? <span className="vopt-sw2" style={{ background: o.colorHex }} /> : null}
                                  {o.value}
                                </span>
                              ))}
                            </span>
                            <span className="vcard-sw">
                              <button type="button" className={`switch${v.active ? ' on' : ''}`} aria-pressed={v.active} onClick={() => updateVariant(v.key, { active: !v.active })} />
                              <button type="button" className="vcard-del" title={t('prodf.galleryRemove')} onClick={() => removeVariant(v.key)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                              </button>
                            </span>
                          </div>
                          <div className="vcard-fields">
                            <div className="ff">
                              <label className="lbl2">{t('prodf.vColPrice')}</label>
                              <Input value={v.price} inputMode="decimal" placeholder={d.price || t('prodf.basePrice')} onChange={(e) => updateVariant(v.key, { price: e.target.value })} style={{ height: 36 }} />
                            </div>
                            <div className="ff">
                              <label className="lbl2">{t('prodf.vColCost')}</label>
                              <Input value={v.cost} inputMode="decimal" placeholder={d.cost || '0'} onChange={(e) => updateVariant(v.key, { cost: e.target.value })} style={{ height: 36 }} />
                            </div>
                            {!d.isSerialized ? (
                              <div className="ff">
                                <label className="lbl2">{t('prodf.vColStock')}</label>
                                <Input value={v.stock} inputMode="numeric" placeholder="0" onChange={(e) => updateVariant(v.key, { stock: e.target.value })} style={{ height: 36 }} />
                              </div>
                            ) : (
                              <div className="ff">
                                <label className="lbl2">{t('prodf.vColStock')}</label>
                                <div className="input" style={{ height: 36, display: 'flex', alignItems: 'center', background: 'var(--inset)' }}>{v.serials.length}</div>
                              </div>
                            )}
                          </div>
                          {d.isSerialized && !editing ? (
                            <SerialsEditor serials={v.serials} type={d.serialType} onChange={(serials) => updateVariant(v.key, { serials })} t={t} />
                          ) : d.isSerialized && editing ? (
                            <div className="hint" style={{ marginTop: 8 }}>{t('prodf.serialsManageHint')}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              </>
              )}
            </div>
          ) : null}

          {stepKey === 'stock' ? (
            <div className="fform">
              {d.isSerialized && !hasVariants && editing ? (
                <div className="form-note"><span>{t('prodf.serialsManageHint')}</span></div>
              ) : d.isSerialized && !hasVariants ? (
                <>
                  <div className="form-note"><span>{t('prodf.stockSerialNote')}</span></div>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.productSerials')} <span className="cnt" style={{ color: 'var(--brand-int)', fontWeight: 700 }}>{t('prodf.serialsCount').replace('{n}', String(d.productSerials.length))}</span></label>
                    <SerialsEditor serials={d.productSerials} type={d.serialType} onChange={(productSerials) => { patch({ productSerials }); setError(null) }} t={t} />
                  </div>
                </>
              ) : hasVariants ? (
                <div className="form-note"><span>{t('prodf.stepVariantsSub')}</span></div>
              ) : !editing ? (
                <div className="ff" style={{ maxWidth: 260 }}>
                  <label className="lbl2">{t('prodf.openingStock')}</label>
                  <Input value={d.openingStock} inputMode="numeric" placeholder="0" onChange={(e) => patch({ openingStock: e.target.value })} />
                </div>
              ) : null}
              <div className="form-2col">
                <div className="ff">
                  <label className="lbl2">{t('prodf.lowStock')}</label>
                  <Input value={d.lowStockThreshold} inputMode="numeric" placeholder="0" onChange={(e) => patch({ lowStockThreshold: e.target.value })} />
                </div>
                <div className="ff">
                  <label className="lbl2">{t('prodf.reorderPoint')}</label>
                  <Input value={d.reorderPoint} inputMode="numeric" placeholder="0" onChange={(e) => patch({ reorderPoint: e.target.value })} />
                </div>
              </div>
            </div>
          ) : null}

          {stepKey === 'online' ? (
            <div className="fform">
              <div className="set-line" style={{ paddingTop: 0 }}>
                <div className="t">
                  <div className="nm">{t('prodf.publish')}</div>
                  <div className="ds">{t('prodf.publishHint')}</div>
                </div>
                <button type="button" className={`switch${d.publishOnline ? ' on' : ''}`} aria-pressed={d.publishOnline} onClick={() => patch({ publishOnline: !d.publishOnline })} />
              </div>
              {d.publishOnline ? (
                <>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.onlineDesc')} <span className="opt">SEO</span></label>
                    <textarea className="input" rows={2} style={{ resize: 'vertical', paddingTop: 10 }} placeholder={t('prodf.onlineDescPh')} value={d.onlineDescription} onChange={(e) => patch({ onlineDescription: e.target.value })} />
                  </div>
                  {tracksInventory ? (
                    <div className="ff" style={{ maxWidth: 200 }}>
                      <label className="lbl2">{t('prodf.reserve')}</label>
                      <Input value={d.onlineReserve} inputMode="numeric" placeholder="0" onChange={(e) => patch({ onlineReserve: e.target.value })} />
                      <div className="hint">{t('prodf.reserveHint')}</div>
                    </div>
                  ) : null}
                  <div className="ff">
                    <label className="lbl2">{t('prodf.metaTitle')} <span className="opt">SEO</span></label>
                    <Input value={d.metaTitle} placeholder={d.name || t('prodf.metaTitlePh')} onChange={(e) => patch({ metaTitle: e.target.value })} />
                    <div className="hint">{t('prodf.metaTitleHint')}</div>
                  </div>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.metaDescription')} <span className="opt">SEO</span></label>
                    <textarea className="input" rows={2} style={{ resize: 'vertical', paddingTop: 10 }} placeholder={t('prodf.metaDescriptionPh')} value={d.metaDescription} onChange={(e) => patch({ metaDescription: e.target.value })} />
                    <div className="hint">{t('prodf.metaDescriptionHint')}</div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {stepKey === 'media' ? (
            <div className="fform">
              <div className="ff">
                <label className="lbl2">{t('prodf.image')}</label>
                <input ref={fileRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} style={{ display: 'none' }} onChange={onPickImage} />
                {d.imageUrl ? (
                  <>
                    <div className="imgpreview">
                      <img src={d.imageUrl} alt={d.name || t('prodf.image')} />
                      {uploading ? <div className="imgpreview-overlay">{t('prodf.imageUploading')}</div> : null}
                    </div>
                    <div className="img-acts">
                      <Button variant="soft" type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>{t('prodf.imageReplace')}</Button>
                      <Button variant="soft" type="button" onClick={() => patch({ imageUrl: null })} disabled={uploading}>{t('prodf.imageRemove')}</Button>
                    </div>
                  </>
                ) : (
                  <button type="button" className="imgdrop" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>
                    <div className="t">{uploading ? t('prodf.imageUploading') : t('prodf.imageUpload')}</div>
                    <div className="s">{t('prodf.imageHint')}</div>
                  </button>
                )}
                {imageError ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">{imageError}</p> : null}
              </div>

              <div className="ff">
                <div className="gallery-head">
                  <span>{t('prodf.gallery')}</span>
                  <button type="button" className="gallery-add" onClick={() => galleryRef.current?.click()} disabled={uploading}>+ {t('prodf.galleryAdd')}</button>
                </div>
                <input ref={galleryRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} multiple style={{ display: 'none' }} onChange={onPickGallery} />
                {d.gallery.length === 0 ? (
                  <div className="gallery-empty">{t('prodf.galleryEmpty')}</div>
                ) : (
                  <div className="gallery-grid">
                    {d.gallery.map((g, i) => (
                      <div key={g.id ?? `new-${i}`} className="gallery-thumb">
                        <img src={g.url} alt="" />
                        <div className="gallery-acts">
                          <button type="button" title={t('prodf.setMain')} onClick={() => patch({ imageUrl: g.url })}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.6 9.1l5.8-.8L12 3Z" /></svg>
                          </button>
                          <button type="button" title={t('prodf.galleryRemove')} onClick={() => patch((s) => ({ gallery: s.gallery.filter((_, idx) => idx !== i) }))}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                          </button>
                        </div>
                        {d.imageUrl === g.url ? <span className="gallery-main-tag">{t('prodf.main')}</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="set-line">
                <div className="t">
                  <div className="nm">{t('prodf.active')}</div>
                  <div className="ds">{t('prodf.activeHint')}</div>
                </div>
                <button type="button" className={`switch${d.isActive ? ' on' : ''}`} aria-pressed={d.isActive} onClick={() => patch({ isActive: !d.isActive })} />
              </div>
              <div className="set-line" style={{ borderBottom: 0 }}>
                <div className="t">
                  <div className="nm">{t('prodf.featured')}</div>
                  <div className="ds">{t('prodf.featuredHint')}</div>
                </div>
                <button type="button" className={`switch${d.isFeatured ? ' on' : ''}`} aria-pressed={d.isFeatured} onClick={() => patch({ isFeatured: !d.isFeatured })} />
              </div>
            </div>
          ) : null}

          {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 14 }} role="alert">{error}</p> : null}

          <div className="wiz-foot">
            <Button variant="soft" type="button" onClick={goPrev} disabled={save.isPending}>
              {isFirst ? t('prodf.cancel') : t('prodf.prev')}
            </Button>
            <span className="spacer" />
            {!isLast ? (
              <Button variant="primary" type="button" onClick={goNext}>{t('prodf.next')}</Button>
            ) : (
              <Button variant="primary" type="button" loading={save.isPending} onClick={submit}>
                {editing ? t('prodf.save') : t('prodf.create')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- per-variant / product-level serial-number entry -------------------------
function SerialsEditor({
  serials,
  type,
  onChange,
  t,
}: {
  serials: string[]
  type: SerialType
  onChange: (next: string[]) => void
  t: ReturnType<typeof useT>
}) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const add = () => {
    const v = val.trim()
    if (!v) return
    if (serials.includes(v)) return setErr(t('prodf.serialDup'))
    if (!validateSerial(v, type)) return setErr(t('prodf.serialInvalid').replace('{type}', t(`prodf.serial_${type}` as Parameters<typeof t>[0])))
    onChange([...serials, v])
    setVal('')
    setErr(null)
  }
  return (
    <div className="serials">
      <div className="serials-head">
        <span className="lbl2">{t('prodf.serials')}</span>
        <span className="cnt">{t('prodf.serialsCount').replace('{n}', String(serials.length))}</span>
      </div>
      <div className="serials-add">
        <Input
          value={val}
          placeholder={t(`prodf.serialPh_${type}` as Parameters<typeof t>[0])}
          inputMode={type === 'IMEI' ? 'numeric' : 'text'}
          onChange={(e) => { setVal(e.target.value); setErr(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <Button type="button" variant="soft" onClick={add}>{t('prodf.serialAdd')}</Button>
      </div>
      {err ? <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }} role="alert">{err}</p> : null}
      {serials.length === 0 ? (
        <div className="hint" style={{ marginTop: 8 }}>{t('prodf.serialsEmpty')}</div>
      ) : (
        <div className="serials-list">
          {serials.map((s) => {
            const ok = validateSerial(s, type)
            return (
              <span key={s} className={`serial-pill${ok ? '' : ' bad'}`}>
                {s}
                <button type="button" onClick={() => onChange(serials.filter((x) => x !== s))}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
