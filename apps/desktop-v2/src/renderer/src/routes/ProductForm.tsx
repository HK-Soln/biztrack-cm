import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BackButton,
  Button,
  CommandSelect,
  ImageGallery,
  Input,
  ScanInput,
  Stepper,
} from '@biztrack/ui/biztrack'
import type { CommandSelectOption } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { SERIAL_TYPES } from '@/lib/serial'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { WizardVariants } from '@/components/products/WizardVariants'
import { WizardSerials } from '@/components/products/WizardSerials'
import { averageOf, type DraftVariant } from '@/components/products/wizardTypes'
import type { ProductImageInput, ProductInput, ProductType, SerialType } from '@shared/ipc'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const TVA_RATE = 19.25
// Only Simple (stock item) and Service are offered. VARIABLE_QUANTITY/COMPOSITE remain valid
// enum values (legacy data) but are intentionally not selectable in the create flow.
const PRODUCT_TYPES: ProductType[] = ['SIMPLE', 'SERVICE']
const DRAFT_KEY = 'biztrack:product-draft:new'

// The product editor. Creating a product runs a dynamic multi-step wizard whose steps depend on
// the product type and selling model (variants / serial units). Variants and serial units are
// captured during creation. Editing keeps a single stacked form; variants/serials are managed on
// the product detail page. New-product drafts persist to localStorage so a refresh resumes.
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
  /** Selling model: sold as distinct variants. Auto-on when the category has attribute groups. */
  hasVariants: boolean
  /** True once the user manually toggled variants — stops category auto-toggle from overriding. */
  variantsTouched: boolean
  isSerialized: boolean
  serialType: SerialType
  warrantyMonths: string
  uniqueItems: boolean
  openingStock: string
  reorderPoint: string
  lowStockThreshold: string
  publishOnline: boolean
  onlineDescription: string
  onlineReserve: string
  metaTitle: string
  metaDescription: string
  gallery: ProductImageInput[]
  /** Variants built in the wizard, committed after the product is created. */
  variants: DraftVariant[]
  /** Serial numbers for a serialized-only product (variants carry their own). */
  serials: string[]
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
  hasVariants: false,
  variantsTouched: false,
  isSerialized: false,
  serialType: 'IMEI',
  warrantyMonths: '',
  uniqueItems: false,
  openingStock: '',
  reorderPoint: '',
  lowStockThreshold: '',
  publishOnline: false,
  onlineDescription: '',
  onlineReserve: '',
  metaTitle: '',
  metaDescription: '',
  gallery: [],
  variants: [],
  serials: [],
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

interface WizStep {
  key: string
  label: string
  body: ReactNode
  validate?: () => string | null
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
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)

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
  // Attribute groups of the selected category — drives the default of the Variants toggle.
  const { data: catLinks = [] } = useQuery({
    queryKey: queryKeys.categoryAttributeLinks(d.categoryId || 'none'),
    queryFn: () => dataClient.attributes.listCategoryLinks(d.categoryId!),
    enabled: !editing && !!d.categoryId && d.productType === 'SIMPLE',
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
  // The seeded "Service" unit (name "Service" / abbr "svc"), auto-selected for service products.
  const serviceUnit = useMemo(
    () =>
      (unitsPage?.data ?? []).find(
        (u) => u.abbreviation?.toLowerCase() === 'svc' || u.name.toLowerCase() === 'service',
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
      isActive: existing.isActive,
      isFeatured: existing.isFeatured,
      hasVariants: existing.hasVariants ?? false,
      variantsTouched: true,
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
      uniqueItems: existing.uniqueItems ?? false,
    })
  }, [editing, existing])

  // --- editing: seed gallery once (primary image first) ---------------------
  useEffect(() => {
    if (!editing || galleryLoadedRef.current || !existingImages) return
    galleryLoadedRef.current = true
    let imgs = existingImages.map((g) => ({ id: g.id, url: g.url, altText: g.altText }))
    // Keep the product's current main image at the front so "primary = first" holds on re-save.
    if (existing?.imageUrl) {
      const idx = imgs.findIndex((g) => g.url === existing.imageUrl)
      if (idx > 0) imgs = [imgs[idx]!, ...imgs.filter((_, i) => i !== idx)]
    }
    patch({ gallery: imgs })
  }, [editing, existingImages, existing])

  // --- create: default the Variants toggle from the category's attribute groups -------------
  useEffect(() => {
    if (editing || d.productType !== 'SIMPLE' || d.variantsTouched) return
    const shouldHave = catLinks.length > 0
    if (shouldHave !== d.hasVariants) patch({ hasVariants: shouldHave })
  }, [editing, catLinks, d.productType, d.variantsTouched, d.hasVariants])

  // --- create: a service product uses the "Service" unit. Fills it once the units load (or on a
  // restored Service draft) when no unit is set, without overriding a unit the user later picks.
  useEffect(() => {
    if (editing || d.productType !== 'SERVICE' || d.unitId || !serviceUnit) return
    patch({
      unitId: serviceUnit.id,
      unitLabel: unitLabelById.get(serviceUnit.id) ?? serviceUnit.name,
      unitAutoFilled: true,
    })
  }, [editing, d.productType, d.unitId, serviceUnit, unitLabelById])

  // --- derived --------------------------------------------------------------
  const costN = Number(d.cost.replace(/\s/g, '')) || 0
  const priceN = Number(d.price.replace(/\s/g, '')) || 0
  const marginPct = priceN > 0 && costN > 0 ? ((priceN - costN) / priceN) * 100 : null
  const isSimple = d.productType === 'SIMPLE'
  const tracksInventory = isSimple
  const hasVariants = isSimple && d.hasVariants
  const serialized = isSimple && d.isSerialized
  // Variant aggregates (average price, cumulative stock) are a create-only view — on edit the
  // wizard doesn't load the variants, so we never recompute the base from an empty list.
  const aggregateView = hasVariants && !editing
  const numOrU = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '')) : undefined)
  const num = (v: string) => Number(v.replace(/\s/g, '')) || 0

  // The variant product's base price/cost = the average across its variants (computed at save).
  const avgPrice = averageOf(d.variants.map((v) => v.price))
  const avgCost = averageOf(d.variants.map((v) => v.cost))

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

  // --- gallery upload -------------------------------------------------------
  const uploadImage = async (file: File): Promise<string> => {
    const bytes = await file.arrayBuffer()
    const res = await dataClient.uploads.file({
      bytes,
      filename: file.name,
      contentType: file.type,
      folder: 'products',
    })
    return res.url
  }

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    patch(DEFAULT_DRAFT)
    setStep(0)
    setMaxReached(0)
    setDraftRestored(false)
  }

  // --- save -----------------------------------------------------------------
  const save = useMutation({
    mutationFn: async () => {
      // Product base price/cost: when creating a variant product it is the average across the
      // variants; otherwise (plain, serialized, or any edit) it is the entered/existing price.
      const baseSelling = aggregateView ? (avgPrice ?? 0) : priceN
      const baseCost = aggregateView ? avgCost : d.cost.trim() ? costN : null
      const useUnique = serialized && !hasVariants && d.uniqueItems
      const input: ProductInput = {
        name: d.name.trim(),
        description: d.description.trim() || null,
        sku: d.sku.trim() || null,
        barcode: d.barcode.trim() || null,
        sellingPrice: baseSelling,
        costPrice: baseCost,
        taxRate: d.taxable ? TVA_RATE : 0,
        unitOfMeasureId: d.unitId,
        categoryId: d.categoryId || null,
        brandId: d.brandId || null,
        modelId: d.modelId || null,
        metaTitle: d.metaTitle.trim() || null,
        metaDescription: d.metaDescription.trim() || null,
        // Primary image = first gallery image. Variant products display each variant's own images.
        imageUrl: hasVariants ? null : (d.gallery[0]?.url ?? null),
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
        uniqueItems: useUnique,
        // Plain simple: product-level opening quantity. Variants/serialized derive their own.
        openingStock:
          tracksInventory && !serialized && !hasVariants ? (numOrU(d.openingStock) ?? 0) : 0,
        // Thresholds are product-level for plain + serialized-only; variants set their own.
        lowStockThreshold:
          tracksInventory && !hasVariants ? (numOrU(d.lowStockThreshold) ?? null) : null,
        reorderPoint: tracksInventory && !hasVariants ? (numOrU(d.reorderPoint) ?? null) : null,
      }

      if (editing && id) {
        const saved = await dataClient.products.update(id, input)
        await dataClient.products.setImages(saved.id, hasVariants ? [] : d.gallery)
        return saved
      }

      const saved = await dataClient.products.create(input)
      if (hasVariants) {
        for (const v of d.variants) {
          const created = await dataClient.products.addVariant(saved.id, {
            name: v.name.trim(),
            sku: v.sku.trim() || null,
            priceOverride: num(v.price) || null,
            costPriceOverride: v.cost.trim() ? num(v.cost) : null,
            lowStockThreshold: v.lowStockThreshold.trim() ? num(v.lowStockThreshold) : null,
            reorderPoint: v.reorderPoint.trim() ? num(v.reorderPoint) : null,
            openingStock: serialized ? 0 : num(v.openingStock),
            isActive: true,
            options: v.options,
          })
          if (v.gallery.length > 0)
            await dataClient.products.setImages(saved.id, v.gallery, created.id)
          if (serialized && v.serials.length > 0) {
            await dataClient.products.addSerialUnits(
              saved.id,
              v.serials.map((sn) => ({
                serialNumber: sn,
                serialType: d.serialType,
                variantId: created.id,
              })),
            )
          }
        }
      } else if (serialized) {
        if (d.serials.length > 0) {
          await dataClient.products.addSerialUnits(
            saved.id,
            d.serials.map((sn) => ({
              serialNumber: sn,
              serialType: d.serialType,
              variantId: null,
            })),
          )
        }
        await dataClient.products.setImages(saved.id, d.gallery)
      } else {
        await dataClient.products.setImages(saved.id, d.gallery)
      }
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
      navigate(`/products/${saved.id}`)
    },
    onError: (err) => {
      console.error('[ProductForm] save failed', err)
      setError(t('prodf.saveError'))
    },
  })

  // --- section render helpers (shared by wizard steps + edit stacked view) ---
  const basicsBody = (
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
      <div className="ff">
        <label className="lbl2">{t('prodf.type')}</label>
        <div className="seg-pick">
          {PRODUCT_TYPES.map((pt) => (
            <button
              key={pt}
              type="button"
              aria-pressed={pt === d.productType}
              disabled={editing}
              onClick={() => {
                if (editing) return
                if (pt === 'SERVICE' && serviceUnit) {
                  // Services are billed as one "Service" unit — auto-fill it.
                  patch({
                    productType: pt,
                    unitId: serviceUnit.id,
                    unitLabel: unitLabelById.get(serviceUnit.id) ?? serviceUnit.name,
                    unitAutoFilled: true,
                  })
                } else if (pt !== 'SERVICE' && d.productType === 'SERVICE' && d.unitAutoFilled) {
                  // Leaving Service: drop the auto-filled Service unit so a real unit is chosen.
                  patch({ productType: pt, unitId: '', unitLabel: null, unitAutoFilled: false })
                } else {
                  patch({ productType: pt })
                }
              }}
            >
              {t(`prodf.type_${pt}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
        <div className="hint">
          {t(`prodf.typeDesc_${d.productType}` as Parameters<typeof t>[0])}
        </div>
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
  )

  const sellingModelBody = (
    <div className="fform">
      <div className="set-line" style={{ paddingTop: 0 }}>
        <div className="t">
          <div className="nm">{t('pwiz.variants')}</div>
          <div className="ds">{t('pwiz.variantsHint')}</div>
        </div>
        <button
          type="button"
          className={`switch${d.hasVariants ? ' on' : ''}`}
          aria-pressed={d.hasVariants}
          onClick={() => patch({ hasVariants: !d.hasVariants, variantsTouched: true })}
        />
      </div>
      <div
        className="set-line"
        style={{ borderBottom: d.isSerialized ? '1px solid var(--border)' : 0 }}
      >
        <div className="t">
          <div className="nm">{t('prodf.serialized')}</div>
          <div className="ds">{t('prodf.serializedHint')}</div>
        </div>
        <button
          type="button"
          className={`switch${d.isSerialized ? ' on' : ''}`}
          aria-pressed={d.isSerialized}
          onClick={() => patch({ isSerialized: !d.isSerialized })}
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
                  onClick={() => patch({ serialType: st })}
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
    </div>
  )

  // Taxable toggle — reused inline on the Pricing step (simple) and the Variants step (variants).
  const taxableToggle = (
    <button
      type="button"
      className={`switch-line${d.taxable ? ' on' : ''}`}
      onClick={() => patch({ taxable: !d.taxable })}
      aria-pressed={d.taxable}
    >
      <span className={`switch${d.taxable ? ' on' : ''}`} />
      <span>{t('prodf.taxable')}</span>
    </button>
  )

  const variantsBody = (
    <div className="fform">
      <p className="hint">{serialized ? t('pwiz.variantsSerialIntro') : t('pwiz.variantsIntro')}</p>
      <WizardVariants
        categoryId={d.categoryId || null}
        serialized={serialized}
        serialType={d.serialType}
        variants={d.variants}
        onChange={(next) => patch({ variants: next })}
      />
      {/* Base price is the average of the variants (computed on save); only tax is set here. */}
      <p className="hint">{t('pwiz.pricingVariantNote')}</p>
      {taxableToggle}
    </div>
  )

  const serialsBody = (
    <div className="fform">
      <p className="hint">{t('pwiz.serialsIntro')}</p>
      <WizardSerials
        serialType={d.serialType}
        serials={d.serials}
        onChange={(next) => patch({ serials: next })}
      />
    </div>
  )

  const pricingBody = (
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
      {taxableToggle}
    </div>
  )

  const stockBody = (
    <div className="fform">
      {serialized ? (
        // Serialized-only: quantity is the serial-unit count; only thresholds are set here.
        <>
          <div className="calc-row">
            <span>{t('pwiz.totalUnits')}</span>
            <span className="big">{d.serials.length}</span>
          </div>
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
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  )

  // The single image gallery (primary = first). No separate main-image field.
  const galleryBlock = (
    <div className="ff">
      <label className="lbl2">{t('prodf.gallery')}</label>
      <ImageGallery
        items={d.gallery}
        onChange={(next) => patch({ gallery: next })}
        onUpload={uploadImage}
        onUploadingChange={setUploading}
        allowedTypes={ALLOWED_IMAGE_TYPES}
        labels={{
          cta: t('gal.cta'),
          hint: t('gal.hint'),
          uploading: t('prodf.imageUploading'),
          remove: t('prodf.galleryRemove'),
          setMain: t('prodf.setMain'),
          main: t('prodf.main'),
          typeError: t('prodf.imageTypeError'),
        }}
      />
    </div>
  )

  const activeFeaturedBlock = (
    <>
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
    </>
  )

  const onlineBlock = (
    <>
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
      {tracksInventory && !hasVariants ? (
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
    </>
  )

  // --- steps (create wizard) ------------------------------------------------
  const steps: WizStep[] = useMemo(() => {
    const validateBasics = () => {
      if (!d.name.trim()) return t('prodf.nameRequired')
      if (!d.unitId) return t('prodf.unitRequired')
      return null
    }
    const validatePricing = () => {
      if (!hasVariants && d.productType !== 'SERVICE' && priceN <= 0)
        return t('prodf.priceRequired')
      return null
    }
    if (d.productType === 'SERVICE') {
      return [
        { key: 'basics', label: t('prodf.stepBasics'), body: basicsBody, validate: validateBasics },
        {
          key: 'pricing',
          label: t('prodf.stepPricing'),
          body: pricingBody,
          validate: validatePricing,
        },
        {
          key: 'media',
          label: t('pwiz.stepMediaOnline'),
          body: (
            <div className="fform">
              {galleryBlock}
              {activeFeaturedBlock}
              {onlineBlock}
            </div>
          ),
        },
      ]
    }
    const list: WizStep[] = [
      { key: 'basics', label: t('prodf.stepBasics'), body: basicsBody, validate: validateBasics },
      { key: 'model', label: t('pwiz.stepSellingModel'), body: sellingModelBody },
    ]
    if (hasVariants) {
      // Variants own their pricing, stock and images — the product-level Pricing/Stock/Images
      // steps would be read-only, so we drop them to keep the flow lean. Tax + base-price note
      // live inside the Variants step.
      list.push({
        key: 'variants',
        label: t('pwiz.stepVariants'),
        body: variantsBody,
        validate: () => (d.variants.length === 0 ? t('pwiz.variantsRequired') : null),
      })
    } else {
      if (serialized) {
        list.push({ key: 'serials', label: t('pwiz.stepSerials'), body: serialsBody })
      }
      list.push({
        key: 'pricing',
        label: t('prodf.stepPricing'),
        body: pricingBody,
        validate: validatePricing,
      })
      list.push({ key: 'stock', label: t('prodf.stepStock'), body: stockBody })
      list.push({
        key: 'media',
        label: t('prodf.stepMedia'),
        body: (
          <div className="fform">
            {galleryBlock}
            {activeFeaturedBlock}
          </div>
        ),
      })
    }
    list.push({
      key: 'online',
      label: t('prodf.stepOnline'),
      body: (
        <div className="fform">
          {/* Variant flow has no Media step, so Active/Featured live here instead. */}
          {hasVariants ? activeFeaturedBlock : null}
          {onlineBlock}
        </div>
      ),
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, error, hasVariants, serialized, priceN, costN, marginPct, avgPrice, avgCost, uploading])

  const clampedStep = Math.min(step, steps.length - 1)
  const current = steps[clampedStep]!
  const isLast = clampedStep === steps.length - 1

  const goNext = () => {
    const err = current.validate?.() ?? null
    if (err) return setError(err)
    setError(null)
    const next = clampedStep + 1
    setStep(next)
    setMaxReached((m) => Math.max(m, next))
  }
  const goStep = (i: number) => {
    if (i <= maxReached) {
      setError(null)
      setStep(i)
    }
  }

  const submit = () => {
    // Run every step's validation before committing.
    for (const s of steps) {
      const err = s.validate?.() ?? null
      if (err) return setError(err)
    }
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
          {editing ? (
            <Button variant="primary" type="button" loading={save.isPending} onClick={submit}>
              {t('prodf.save')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="page-head">
        <div>
          <h1>{editing ? t('prodf.editTitle') : t('prodf.addTitle')}</h1>
          <p>{editing ? t('prodf.editSubtitle') : t('prodf.subtitle')}</p>
        </div>
      </div>

      {draftRestored && !editing ? (
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

      {editing ? (
        // Edit: stacked sections. Variants/serial units are managed on the product detail page.
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="fsec-h">{t('prodf.stepBasics')}</div>
            {basicsBody}
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="fsec-h">{t('prodf.stepPricing')}</div>
            {pricingBody}
          </div>
          {isSimple ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="fsec-h">{t('prodf.stepStock')}</div>
              {stockBody}
            </div>
          ) : null}
          {!hasVariants ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="fsec-h">{t('prodf.stepMedia')}</div>
              <div className="fform">
                {galleryBlock}
                {activeFeaturedBlock}
              </div>
            </div>
          ) : null}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="fsec-h">{t('prodf.stepOnline')}</div>
            <div className="fform">{onlineBlock}</div>
          </div>
        </>
      ) : (
        // Create: dynamic multi-step wizard.
        <>
          <Stepper
            steps={steps.map((s) => ({ key: s.key, label: s.label }))}
            current={clampedStep}
            maxReached={maxReached}
            onStepClick={goStep}
            className="prodf-stepper"
          />
          <div className="card" style={{ marginTop: 16, marginBottom: 16 }}>
            <div className="fsec-h">{current.label}</div>
            {current.body}
          </div>
        </>
      )}

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 14 }} role="alert">
          {error}
        </p>
      ) : null}

      {editing ? (
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
            {t('prodf.save')}
          </Button>
        </div>
      ) : (
        <div className="fp-actions">
          <Button
            variant="soft"
            type="button"
            onClick={() => (clampedStep === 0 ? navigate('/products') : setStep(clampedStep - 1))}
            disabled={save.isPending}
          >
            {clampedStep === 0 ? t('prodf.cancel') : t('pwiz.back')}
          </Button>
          {isLast ? (
            <Button variant="primary" type="button" loading={save.isPending} onClick={submit}>
              {t('pwiz.create')}
            </Button>
          ) : (
            <Button variant="primary" type="button" onClick={goNext}>
              {t('pwiz.next')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
