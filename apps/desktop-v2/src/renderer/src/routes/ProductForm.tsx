import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BackButton, Button, CommandSelect, Input, ScanInput } from '@biztrack/ui/biztrack'
import type { CommandSelectOption } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { SERIAL_TYPES } from '@/lib/serial'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import type { ProductImageInput, ProductInput, ProductType, SerialType } from '@shared/ipc'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const TVA_RATE = 19.25
// Only Simple (stock item) and Service are offered. VARIABLE_QUANTITY/COMPOSITE remain valid
// enum values (legacy data) but are intentionally not selectable in the create flow.
const PRODUCT_TYPES: ProductType[] = ['SIMPLE', 'SERVICE']
const DRAFT_KEY = 'biztrack:product-draft:new'

// The product editor: a single, mostly-optional page. Only Name · Category · Price · Unit are
// required — a sellable product exists in seconds. Options/variants, serial units, extra images
// and full SEO are enriched afterward on the product page (create fast, enrich progressively).
// New-product drafts persist to localStorage so a refresh resumes.
interface Draft {
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
  /** True while the unit came from a category default — so switching category refreshes it,
   * but a unit the user picked themselves is never overwritten. */
  unitAutoFilled: boolean
  cost: string
  price: string
  taxable: boolean
  isSerialized: boolean
  serialType: SerialType
  warrantyMonths: string
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
  unitAutoFilled: false,
  cost: '',
  price: '',
  taxable: true,
  isSerialized: false,
  serialType: 'IMEI',
  warrantyMonths: '',
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

export function ProductForm() {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const qc = useQueryClient()

  const initial = useRef<Draft>(editing ? DEFAULT_DRAFT : (readDraft() ?? DEFAULT_DRAFT)).current
  const [d, patch] = useReducer(reducer, initial)
  const [draftRestored, setDraftRestored] = useState(() => !editing && readDraft() != null)

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
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const loadedRef = useRef(false)
  const galleryLoadedRef = useRef(false)
  // categoryId → its default unit id, cached from loadCategories so selecting a category
  // can auto-fill the unit field.
  const catDefaultUnitRef = useRef<Map<string, string | null>>(new Map())

  // --- data loads -----------------------------------------------------------
  const { data: existing } = useQuery({
    queryKey: [...queryKeys.products, 'one', id],
    queryFn: () => dataClient.products.get(id!),
    enabled: editing,
  })
  const { data: selectedBrand } = useQuery({
    queryKey: [...queryKeys.brands, 'one', d.brandId],
    queryFn: () => dataClient.brands.get(d.brandId),
    enabled: !!d.brandId,
  })
  // Terminal categories under the selected brand — used to auto-pick when the brand resolves
  // to a single category.
  const { data: brandSelectable = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'selectable', d.brandId],
    queryFn: () => dataClient.categories.listSelectable({ brandId: d.brandId }),
    enabled: !!d.brandId,
  })
  const { data: existingImages } = useQuery({
    queryKey: [...queryKeys.products, 'images', id],
    queryFn: () => dataClient.products.listImages(id!),
    enabled: editing,
  })
  // Units, to label a category's default unit when auto-filling the unit field.
  const { data: unitsPage } = useQuery({
    queryKey: [...queryKeys.units, 'all-for-product'],
    queryFn: () => dataClient.units.list({ limit: 100 }),
  })
  const unitLabelById = useMemo(
    () =>
      new Map(
        (unitsPage?.data ?? []).map((u) => [
          u.id,
          u.abbreviation ? `${u.name} (${u.abbreviation})` : u.name,
        ]),
      ),
    [unitsPage],
  )

  // --- editing: seed the product fields once --------------------------------
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
      lowStockThreshold:
        existing.lowStockThreshold != null ? String(existing.lowStockThreshold) : '',
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

  // --- derived --------------------------------------------------------------
  const costN = Number(d.cost.replace(/\s/g, '')) || 0
  const priceN = Number(d.price.replace(/\s/g, '')) || 0
  const marginPct = priceN > 0 && costN > 0 ? ((priceN - costN) / priceN) * 100 : null
  const tracksInventory = d.productType === 'SIMPLE' || d.productType === 'VARIABLE_QUANTITY'
  // Only discrete stock items can be serial-tracked (weight/volume + services + bundles cannot).
  const canSerialize = d.productType === 'SIMPLE'
  const numOrU = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '')) : undefined)

  // --- loaders (search reaches SQLite/API, not just the loaded page) ---------
  const loadBrands = useCallback(
    (s: string) =>
      dataClient.brands
        .list({ search: s, limit: 20 })
        .then((r) => r.data.map((b) => ({ value: b.id, label: b.name }))),
    [],
  )
  const loadUnits = useCallback(
    (s: string) =>
      dataClient.units.list({ search: s, limit: 20 }).then((r) =>
        r.data.map((u) => ({
          value: u.id,
          label: u.abbreviation ? `${u.name} (${u.abbreviation})` : u.name,
        })),
      ),
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
  // Eligibility (terminal leaves, brand-scoped expansion) is resolved by the service.
  const loadCategories = useCallback(
    (s: string) =>
      dataClient.categories
        .listSelectable({ brandId: d.brandId || undefined, search: s })
        .then((rows) => {
          for (const c of rows) catDefaultUnitRef.current.set(c.id, c.defaultUnitOfMeasureId)
          return rows.map((c) => ({ value: c.id, label: c.name }))
        }),
    [d.brandId],
  )

  // Selecting a category fills the unit from the category's default. It refreshes the unit
  // when it's empty or was itself auto-filled from a previous category — but never overwrites
  // a unit the user picked themselves.
  const onCategoryChange = (value: string | null, option?: CommandSelectOption) => {
    const patchData: Partial<Draft> = {
      categoryId: value ?? '',
      categoryLabel: option?.label ?? null,
    }
    const defaultUnit = value ? catDefaultUnitRef.current.get(value) : null
    if (defaultUnit && (!d.unitId || d.unitAutoFilled)) {
      patchData.unitId = defaultUnit
      patchData.unitLabel = unitLabelById.get(defaultUnit) ?? null
      patchData.unitAutoFilled = true
    }
    patch(patchData)
  }

  const onBrandChange = (value: string | null, option?: CommandSelectOption) =>
    patch({
      brandId: value ?? '',
      brandLabel: option?.label ?? null,
      categoryId: '',
      categoryLabel: null,
      modelId: '',
      modelLabel: null,
    })

  // When the brand resolves: auto-pick its sole selectable category (+ default unit) and
  // resolve the model label.
  useEffect(() => {
    if (!selectedBrand) return
    if (!d.categoryId && brandSelectable.length === 1) {
      const only = brandSelectable[0]!
      catDefaultUnitRef.current.set(only.id, only.defaultUnitOfMeasureId)
      const fillUnit = only.defaultUnitOfMeasureId && (!d.unitId || d.unitAutoFilled)
      patch({
        categoryId: only.id,
        categoryLabel: only.name,
        ...(fillUnit
          ? {
              unitId: only.defaultUnitOfMeasureId!,
              unitLabel: unitLabelById.get(only.defaultUnitOfMeasureId!) ?? null,
              unitAutoFilled: true,
            }
          : {}),
      })
    }
    if (d.modelId && !d.modelLabel) {
      patch({ modelLabel: selectedBrand.models.find((m) => m.id === d.modelId)?.name ?? null })
    }
  }, [
    selectedBrand,
    brandSelectable,
    d.categoryId,
    d.unitId,
    d.unitAutoFilled,
    d.modelId,
    d.modelLabel,
    unitLabelById,
  ])

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
      const res = await dataClient.uploads.file({
        bytes,
        filename: file.name,
        contentType: file.type,
        folder: 'products',
      })
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
        const res = await dataClient.uploads.file({
          bytes,
          filename: file.name,
          contentType: file.type,
          folder: 'products',
        })
        patch((s) => ({ gallery: [...s.gallery, { url: res.url }] }))
      }
    } catch {
      setImageError(t('prodf.imageError'))
    } finally {
      setUploading(false)
    }
  }

  // --- validation + save ----------------------------------------------------
  function validate(): string | null {
    if (!d.name.trim()) return t('prodf.nameRequired')
    if (!d.unitId) return t('prodf.unitRequired')
    // Services often have no fixed price (e.g. repairs) → allowed 0. Everything else needs one.
    if (d.productType !== 'SERVICE' && priceN <= 0) return t('prodf.priceRequired')
    return null
  }

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    patch(DEFAULT_DRAFT)
    setDraftRestored(false)
  }

  const save = useMutation({
    mutationFn: async () => {
      const serialized = canSerialize && d.isSerialized
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
        isSerialized: serialized,
        serialType: serialized ? d.serialType : null,
        warrantyMonths: serialized ? (numOrU(d.warrantyMonths) ?? null) : null,
        // A serialized product's stock is its serial-unit count; variants own their own stock.
        // Both are added on the product page after saving, so opening stock is product-level only.
        openingStock: tracksInventory && !serialized ? (numOrU(d.openingStock) ?? 0) : 0,
        lowStockThreshold: tracksInventory ? (numOrU(d.lowStockThreshold) ?? null) : null,
        reorderPoint: tracksInventory ? (numOrU(d.reorderPoint) ?? null) : null,
      }
      const saved =
        editing && id
          ? await dataClient.products.update(id, input)
          : await dataClient.products.create(input)
      await dataClient.products.setImages(saved.id, d.gallery)
      return saved
    },
    onSuccess: (saved) => {
      if (!editing) {
        try {
          localStorage.removeItem(DRAFT_KEY)
        } catch {
          /* ignore */
        }
      }
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      // Land on the product page — the enrichment surface for options, serials, images & SEO.
      navigate(`/products/${saved.id}`)
    },
    onError: (err) => {
      console.error('[ProductForm] save failed', err)
      setError(t('prodf.saveError'))
    },
  })

  const submit = () => {
    const err = validate()
    if (err) return setError(err)
    setError(null)
    save.mutate()
  }

  // --- render ---------------------------------------------------------------
  return (
    <div className="frame">
      <div className="detail-top">
        <BackButton onClick={() => navigate('/products')}>{t('prodf.back')}</BackButton>
        <div className="acts2">
          <Button
            variant="soft"
            type="button"
            onClick={() => navigate('/products')}
            disabled={save.isPending}
          >
            {t('prodf.cancel')}
          </Button>
          <Button variant="primary" type="button" loading={save.isPending} onClick={submit}>
            {editing ? t('prodf.save') : t('prodf.saveAndOpen')}
          </Button>
        </div>
      </div>

      <div className="page-head">
        <div>
          <h1>{editing ? t('prodf.editTitle') : t('prodf.addTitle')}</h1>
          <p>{editing ? t('prodf.editSubtitle') : t('prodf.subtitle')}</p>
        </div>
      </div>

      {draftRestored ? (
        <div className="form-note" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {t('prodf.draftFound')}
          </span>
          <button type="button" className="gallery-add" onClick={discardDraft}>
            {t('prodf.draftDiscard')}
          </button>
        </div>
      ) : null}

      {/* Essentials — the only required part. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fsec-h">{t('prodf.stepBasics')}</div>
        <div className="fform">
          <div className="ff">
            <label className="lbl2">
              {t('prodf.name')} <span className="req">*</span>
            </label>
            <Input
              value={d.name}
              placeholder={t('prodf.namePh')}
              onChange={(e) => {
                patch({ name: e.target.value })
                setError(null)
              }}
              error={!!error && !d.name.trim()}
            />
          </div>
          <div className="form-2col">
            <div className="ff">
              <label className="lbl2">{t('prodf.brand')}</label>
              <CommandSelect
                value={d.brandId || null}
                valueLabel={d.brandLabel}
                onChange={onBrandChange}
                loadOptions={loadBrands}
                placeholder={t('prodf.brandNone')}
                searchPlaceholder={t('prodf.searchBrands')}
                clearLabel={t('prodf.brandNone')}
              />
            </div>
            <div className="ff">
              <label className="lbl2">{t('prodf.category')}</label>
              <CommandSelect
                value={d.categoryId || null}
                valueLabel={d.categoryLabel}
                onChange={onCategoryChange}
                loadOptions={loadCategories}
                placeholder={t('prodf.categoryNone')}
                searchPlaceholder={t('prodf.searchCategories')}
                clearLabel={t('prodf.categoryNone')}
              />
            </div>
          </div>
          <div className="form-2col">
            <div className="ff">
              <label className="lbl2">{t('prodf.model')}</label>
              <CommandSelect
                value={d.modelId || null}
                valueLabel={d.modelLabel}
                onChange={(v, o) => patch({ modelId: v ?? '', modelLabel: o?.label ?? null })}
                loadOptions={loadModels}
                placeholder={selectedBrand ? t('prodf.modelPick') : t('prodf.modelNoBrand')}
                searchPlaceholder={t('prodf.searchModels')}
                emptyText={t('prodf.modelNone')}
                clearLabel={t('prodf.modelClear')}
                disabled={!selectedBrand}
              />
            </div>
            <div className="ff">
              <label className="lbl2">
                {t('prodf.unit')} <span className="req">*</span>
              </label>
              <CommandSelect
                value={d.unitId || null}
                valueLabel={d.unitLabel}
                onChange={(v, o) => {
                  patch({ unitId: v ?? '', unitLabel: o?.label ?? null, unitAutoFilled: false })
                  setError(null)
                }}
                loadOptions={loadUnits}
                placeholder={t('prodf.unitPick')}
                searchPlaceholder={t('prodf.searchUnits')}
                invalid={!!error && !d.unitId}
              />
            </div>
          </div>
          <div className="form-2col">
            <div className="ff">
              <label className="lbl2">{t('prodf.sku')}</label>
              <Input
                value={d.sku}
                placeholder={t('prodf.skuPh')}
                onChange={(e) => patch({ sku: e.target.value })}
              />
            </div>
            <div className="ff">
              <label className="lbl2">{t('prodf.barcode')}</label>
              <ScanInput
                value={d.barcode}
                placeholder={t('prodf.barcodePh')}
                onChange={(e) => patch({ barcode: e.target.value })}
                onScan={(v) => patch({ barcode: v })}
                scanTitle={t('scan.title')}
                cameraTitle={t('scan.camTitle')}
                cameraHint={t('scan.camHint')}
                cameraError={t('scan.camError')}
              />
            </div>
          </div>
          <div className="ff">
            <label className="lbl2">
              {t('prodf.description')} <span className="opt">{t('prodf.optional')}</span>
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ resize: 'vertical', paddingTop: 10 }}
              placeholder={t('prodf.descriptionPh')}
              value={d.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Pricing. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fsec-h">{t('prodf.stepPricing')}</div>
        <div className="fform">
          <div className="form-2col">
            <div className="ff">
              <label className="lbl2">{t('prodf.cost')}</label>
              <Input
                value={d.cost}
                inputMode="decimal"
                placeholder="0"
                onChange={(e) => patch({ cost: e.target.value })}
              />
            </div>
            <div className="ff">
              <label className="lbl2">
                {t('prodf.price')} <span className="req">*</span>
              </label>
              <Input
                value={d.price}
                inputMode="decimal"
                placeholder="0"
                onChange={(e) => {
                  patch({ price: e.target.value })
                  setError(null)
                }}
                error={!!error && d.productType !== 'SERVICE' && priceN <= 0}
              />
            </div>
          </div>
          <div className="calc-row">
            <span>{t('prodf.margin')}</span>
            <span>
              <span className="big">{marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}</span>
              {marginPct != null ? <> · {money.format(priceN - costN)}</> : null}
            </span>
          </div>
          <button
            type="button"
            className={`switch-line${d.taxable ? ' on' : ''}`}
            onClick={() => patch({ taxable: !d.taxable })}
            aria-pressed={d.taxable}
          >
            <span className={`switch${d.taxable ? ' on' : ''}`} />
            <span>{t('prodf.taxable')}</span>
          </button>
        </div>
      </div>

      {/* Selling model — how the product is sold. Changeable anytime (except serialization,
          which is fixed after create). */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fsec-h">{t('prodf.sellingModel')}</div>
        <div className="fform">
          <div className="ff">
            <label className="lbl2">{t('prodf.type')}</label>
            <div className="seg-pick">
              {PRODUCT_TYPES.map((pt) => (
                <button
                  key={pt}
                  type="button"
                  aria-pressed={pt === d.productType}
                  onClick={() => patch({ productType: pt })}
                >
                  {t(`prodf.type_${pt}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
            <div className="hint">
              {t(`prodf.typeDesc_${d.productType}` as Parameters<typeof t>[0])}
            </div>
          </div>

          {canSerialize ? (
            <>
              <div
                className="set-line"
                style={{ borderBottom: d.isSerialized ? '1px solid var(--border)' : 0 }}
              >
                <div className="t">
                  <div className="nm">{t('prodf.serialized')}</div>
                  <div className="ds">
                    {editing ? t('prodf.serializedLocked') : t('prodf.serializedHint')}
                  </div>
                </div>
                <button
                  type="button"
                  className={`switch${d.isSerialized ? ' on' : ''}`}
                  aria-pressed={d.isSerialized}
                  disabled={editing}
                  title={editing ? t('prodf.serializedLocked') : undefined}
                  onClick={() => {
                    if (!editing) patch({ isSerialized: !d.isSerialized })
                  }}
                />
              </div>
              {d.isSerialized ? (
                <div className="form-2col" style={{ marginTop: 12 }}>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.serialType')}</label>
                    <div className="seg-pick">
                      {SERIAL_TYPES.map((st) => (
                        <button
                          key={st}
                          type="button"
                          aria-pressed={st === d.serialType}
                          disabled={editing}
                          onClick={() => {
                            if (!editing) patch({ serialType: st })
                          }}
                        >
                          {t(`prodf.serial_${st}` as Parameters<typeof t>[0])}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.warranty')}</label>
                    <Input
                      value={d.warrantyMonths}
                      inputMode="numeric"
                      placeholder="0"
                      onChange={(e) => patch({ warrantyMonths: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {/* Options/serials are enriched on the product page after saving. */}
          {d.productType === 'SIMPLE' ? (
            <div className="form-note" style={{ marginTop: 4 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
              <span>{d.isSerialized ? t('prodf.enrichSerials') : t('prodf.enrichOptions')}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Stock — plain quantity for non-serialized stock items. */}
      {tracksInventory ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="fsec-h">{t('prodf.stepStock')}</div>
          <div className="fform">
            {!canSerialize || !d.isSerialized ? (
              <div className="ff" style={{ maxWidth: 260 }}>
                <label className="lbl2">{t('prodf.openingStock')}</label>
                <Input
                  value={d.openingStock}
                  inputMode="numeric"
                  placeholder="0"
                  onChange={(e) => patch({ openingStock: e.target.value })}
                  disabled={editing}
                />
                {editing ? <div className="hint">{t('prodf.openingStockLocked')}</div> : null}
              </div>
            ) : (
              <div className="form-note">
                <span>{t('prodf.enrichSerials')}</span>
              </div>
            )}
            <div className="form-2col">
              <div className="ff">
                <label className="lbl2">{t('prodf.lowStock')}</label>
                <Input
                  value={d.lowStockThreshold}
                  inputMode="numeric"
                  placeholder="0"
                  onChange={(e) => patch({ lowStockThreshold: e.target.value })}
                />
              </div>
              <div className="ff">
                <label className="lbl2">{t('prodf.reorderPoint')}</label>
                <Input
                  value={d.reorderPoint}
                  inputMode="numeric"
                  placeholder="0"
                  onChange={(e) => patch({ reorderPoint: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Media. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fsec-h">{t('prodf.stepMedia')}</div>
        <div className="fform">
          <div className="ff">
            <label className="lbl2">{t('prodf.image')}</label>
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              style={{ display: 'none' }}
              onChange={onPickImage}
            />
            {d.imageUrl ? (
              <>
                <div className="imgpreview">
                  <img src={d.imageUrl} alt={d.name || t('prodf.image')} />
                  {uploading ? (
                    <div className="imgpreview-overlay">{t('prodf.imageUploading')}</div>
                  ) : null}
                </div>
                <div className="img-acts">
                  <Button
                    variant="soft"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {t('prodf.imageReplace')}
                  </Button>
                  <Button
                    variant="soft"
                    type="button"
                    onClick={() => patch({ imageUrl: null })}
                    disabled={uploading}
                  >
                    {t('prodf.imageRemove')}
                  </Button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="imgdrop"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <div className="t">
                  {uploading ? t('prodf.imageUploading') : t('prodf.imageUpload')}
                </div>
                <div className="s">{t('prodf.imageHint')}</div>
              </button>
            )}
            {imageError ? (
              <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
                {imageError}
              </p>
            ) : null}
          </div>

          <div className="ff">
            <div className="gallery-head">
              <span>{t('prodf.gallery')}</span>
              <button
                type="button"
                className="gallery-add"
                onClick={() => galleryRef.current?.click()}
                disabled={uploading}
              >
                + {t('prodf.galleryAdd')}
              </button>
            </div>
            <input
              ref={galleryRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              multiple
              style={{ display: 'none' }}
              onChange={onPickGallery}
            />
            {d.gallery.length === 0 ? (
              <div className="gallery-empty">{t('prodf.galleryEmpty')}</div>
            ) : (
              <div className="gallery-grid">
                {d.gallery.map((g, i) => (
                  <div key={g.id ?? `new-${i}`} className="gallery-thumb">
                    <img src={g.url} alt="" />
                    <div className="gallery-acts">
                      <button
                        type="button"
                        title={t('prodf.setMain')}
                        onClick={() => patch({ imageUrl: g.url })}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.6 9.1l5.8-.8L12 3Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title={t('prodf.galleryRemove')}
                        onClick={() =>
                          patch((s) => ({ gallery: s.gallery.filter((_, idx) => idx !== i) }))
                        }
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    </div>
                    {d.imageUrl === g.url ? (
                      <span className="gallery-main-tag">{t('prodf.main')}</span>
                    ) : null}
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
            <button
              type="button"
              className={`switch${d.isActive ? ' on' : ''}`}
              aria-pressed={d.isActive}
              onClick={() => patch({ isActive: !d.isActive })}
            />
          </div>
          <div className="set-line" style={{ borderBottom: 0 }}>
            <div className="t">
              <div className="nm">{t('prodf.featured')}</div>
              <div className="ds">{t('prodf.featuredHint')}</div>
            </div>
            <button
              type="button"
              className={`switch${d.isFeatured ? ' on' : ''}`}
              aria-pressed={d.isFeatured}
              onClick={() => patch({ isFeatured: !d.isFeatured })}
            />
          </div>
        </div>
      </div>

      {/* Online store — optional. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fsec-h">{t('prodf.stepOnline')}</div>
        <div className="fform">
          <div className="set-line" style={{ paddingTop: 0 }}>
            <div className="t">
              <div className="nm">{t('prodf.publishOnline')}</div>
              <div className="ds">{t('prodf.publishOnlineHint')}</div>
            </div>
            <button
              type="button"
              className={`switch${d.publishOnline ? ' on' : ''}`}
              aria-pressed={d.publishOnline}
              onClick={() => patch({ publishOnline: !d.publishOnline })}
            />
          </div>
          <div className="ff">
            <label className="lbl2">
              {t('prodf.onlineDesc')} <span className="opt">SEO</span>
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ resize: 'vertical', paddingTop: 10 }}
              placeholder={t('prodf.onlineDescPh')}
              value={d.onlineDescription}
              onChange={(e) => patch({ onlineDescription: e.target.value })}
            />
          </div>
          {tracksInventory ? (
            <div className="ff" style={{ maxWidth: 200 }}>
              <label className="lbl2">{t('prodf.reserve')}</label>
              <Input
                value={d.onlineReserve}
                inputMode="numeric"
                placeholder="0"
                onChange={(e) => patch({ onlineReserve: e.target.value })}
              />
              <div className="hint">{t('prodf.reserveHint')}</div>
            </div>
          ) : null}
          <div className="ff">
            <label className="lbl2">
              {t('prodf.metaTitle')} <span className="opt">SEO</span>
            </label>
            <Input
              value={d.metaTitle}
              placeholder={d.name || t('prodf.metaTitlePh')}
              onChange={(e) => patch({ metaTitle: e.target.value })}
            />
            <div className="hint">{t('prodf.metaTitleHint')}</div>
          </div>
          <div className="ff">
            <label className="lbl2">
              {t('prodf.metaDescription')} <span className="opt">SEO</span>
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ resize: 'vertical', paddingTop: 10 }}
              placeholder={t('prodf.metaDescriptionPh')}
              value={d.metaDescription}
              onChange={(e) => patch({ metaDescription: e.target.value })}
            />
            <div className="hint">{t('prodf.metaDescriptionHint')}</div>
          </div>
        </div>
      </div>

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 14 }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="fp-actions">
        <Button
          variant="soft"
          type="button"
          onClick={() => navigate('/products')}
          disabled={save.isPending}
        >
          {t('prodf.cancel')}
        </Button>
        <Button variant="primary" type="button" loading={save.isPending} onClick={submit}>
          {editing ? t('prodf.save') : t('prodf.saveAndOpen')}
        </Button>
      </div>
    </div>
  )
}
