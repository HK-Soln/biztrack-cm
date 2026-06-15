import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input } from '@biztrack/ui/biztrack'
import type { CommandSelectOption } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import type { ProductImageInput, ProductInput, ProductType, SerialType } from '@shared/ipc'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const TVA_RATE = 19.25
const XAF = new Intl.NumberFormat('fr-CM', { maximumFractionDigits: 0 })
const PRODUCT_TYPES: ProductType[] = ['SIMPLE', 'SERVICE', 'VARIABLE_QUANTITY', 'COMPOSITE']
const SERIAL_TYPES: SerialType[] = ['IMEI', 'SERIAL_NUMBER', 'BARCODE']

// Full-page add/edit product form (design-form-product): Basics (name, brand →
// category + model, sku, barcode), Pricing (cost/price/margin/taxable), type, image,
// active. Variants, opening stock and online-store fields are deferred to their slices.
export function ProductForm() {
  const t = useT()
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const qc = useQueryClient()

  const { data: existing } = useQuery({
    queryKey: [...queryKeys.products, 'one', id],
    queryFn: () => dataClient.products.get(id!),
    enabled: isElectron && editing,
  })
  // Full category set (cached) — to resolve names for a brand's L3 category ids.
  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: isElectron,
  })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [brandId, setBrandId] = useState('')
  const [brandLabel, setBrandLabel] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null)
  const [modelId, setModelId] = useState('')
  const [modelLabel, setModelLabel] = useState<string | null>(null)
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  const [taxable, setTaxable] = useState(true)
  const [productTypeV, setProductTypeV] = useState<ProductType>('SIMPLE')
  const [unitId, setUnitId] = useState('')
  const [unitLabel, setUnitLabel] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [gallery, setGallery] = useState<ProductImageInput[]>([])
  const [galleryLoaded, setGalleryLoaded] = useState(false)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [isActive, setIsActive] = useState(true)
  const [isFeatured, setIsFeatured] = useState(false)
  const [openingStock, setOpeningStock] = useState('')
  const [reorderPoint, setReorderPoint] = useState('')
  const [lowStockThreshold, setLowStockThreshold] = useState('')
  const [publishOnline, setPublishOnline] = useState(false)
  const [onlineDescription, setOnlineDescription] = useState('')
  const [onlineReserve, setOnlineReserve] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [isSerialized, setIsSerialized] = useState(false)
  const [serialType, setSerialType] = useState<SerialType>('IMEI')
  const [warrantyMonths, setWarrantyMonths] = useState('')
  // Variants: which options are selected per attribute group + per-combination overrides.
  const [selectedOpts, setSelectedOpts] = useState<Record<string, string[]>>({})
  const [variantOverrides, setVariantOverrides] = useState<
    Record<string, { price: string; cost: string; stock: string; active: boolean }>
  >({})
  const [variantsLoaded, setVariantsLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // The selected brand (its L3 categories + models constrain the pickers).
  const { data: selectedBrand } = useQuery({
    queryKey: [...queryKeys.brands, 'one', brandId],
    queryFn: () => dataClient.brands.get(brandId),
    enabled: isElectron && !!brandId,
  })
  const { data: existingImages } = useQuery({
    queryKey: [...queryKeys.products, 'images', id],
    queryFn: () => dataClient.products.listImages(id!),
    enabled: isElectron && editing,
  })

  // Seed the gallery once (when editing).
  useEffect(() => {
    if (!editing || galleryLoaded || !existingImages) return
    setGallery(existingImages.map((g) => ({ id: g.id, url: g.url, altText: g.altText })))
    setGalleryLoaded(true)
  }, [editing, galleryLoaded, existingImages])

  // The category's attribute groups drive the variant dimensions.
  const { data: categoryLinks = [] } = useQuery({
    queryKey: queryKeys.categoryAttributeLinks(categoryId || 'none'),
    queryFn: () => dataClient.attributes.listCategoryLinks(categoryId),
    enabled: isElectron && !!categoryId,
  })
  const { data: existingVariants } = useQuery({
    queryKey: [...queryKeys.products, 'variants', id],
    queryFn: () => dataClient.products.listVariants(id!),
    enabled: isElectron && editing,
  })

  // Seed variant selections/overrides once (when editing).
  useEffect(() => {
    if (!editing || variantsLoaded || !existingVariants || existingVariants.length === 0) return
    const sel: Record<string, string[]> = {}
    const ov: Record<string, { price: string; cost: string; stock: string; active: boolean }> = {}
    for (const v of existingVariants) {
      for (const o of v.options) {
        sel[o.attributeGroupId] = [...new Set([...(sel[o.attributeGroupId] ?? []), o.attributeOptionId])]
      }
      const sig = [...v.options.map((o) => o.attributeOptionId)].sort().join('|')
      ov[sig] = {
        price: v.priceOverride != null ? String(v.priceOverride) : '',
        cost: v.costPriceOverride != null ? String(v.costPriceOverride) : '',
        stock: String(v.stockQuantity ?? 0),
        active: v.isActive,
      }
    }
    setSelectedOpts(sel)
    setVariantOverrides(ov)
    setVariantsLoaded(true)
  }, [editing, variantsLoaded, existingVariants])

  const toggleOpt = (groupId: string, optionId: string) =>
    setSelectedOpts((prev) => {
      const cur = prev[groupId] ?? []
      return { ...prev, [groupId]: cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId] }
    })

  // Cartesian product of selected options across groups that have ≥1 selection.
  const variantMatrix = (() => {
    const dims = categoryLinks
      .map((g) => ({ group: g, optionIds: (selectedOpts[g.attributeGroupId] ?? []) }))
      .filter((d) => d.optionIds.length > 0)
    if (dims.length === 0) return [] as Array<{ sig: string; label: string; options: { attributeGroupId: string; attributeOptionId: string }[] }>
    let combos: { attributeGroupId: string; attributeOptionId: string; value: string }[][] = [[]]
    for (const d of dims) {
      const next: typeof combos = []
      for (const combo of combos) {
        for (const optId of d.optionIds) {
          const opt = d.group.options.find((o) => o.id === optId)
          next.push([...combo, { attributeGroupId: d.group.attributeGroupId, attributeOptionId: optId, value: opt?.value ?? '?' }])
        }
      }
      combos = next
    }
    return combos.map((combo) => ({
      sig: [...combo.map((c) => c.attributeOptionId)].sort().join('|'),
      label: combo.map((c) => c.value).join(' / '),
      options: combo.map((c) => ({ attributeGroupId: c.attributeGroupId, attributeOptionId: c.attributeOptionId })),
    }))
  })()

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
        setGallery((prev) => [...prev, { url: res.url }])
      }
    } catch {
      setImageError(t('prodf.imageError'))
    } finally {
      setUploading(false)
    }
  }

  // Populate once when editing (labels come from the joined names on the product).
  useEffect(() => {
    if (!editing || loaded || !existing) return
    setName(existing.name)
    setDescription(existing.description ?? '')
    setBrandId(existing.brandId ?? '')
    setBrandLabel(existing.brandName)
    setCategoryId(existing.categoryId ?? '')
    setCategoryLabel(existing.categoryName)
    setModelId(existing.modelId ?? '')
    setSku(existing.sku ?? '')
    setBarcode(existing.barcode ?? '')
    setCost(existing.costPrice != null ? String(existing.costPrice) : '')
    setPrice(String(existing.sellingPrice))
    setTaxable((existing.taxRate ?? 0) > 0)
    setProductTypeV(existing.productType)
    setUnitId(existing.unitOfMeasureId ?? '')
    setUnitLabel(existing.unitAbbr)
    setImageUrl(existing.imageUrl)
    setIsActive(existing.isActive)
    setIsFeatured(existing.isFeatured)
    setReorderPoint(existing.reorderPoint != null ? String(existing.reorderPoint) : '')
    setLowStockThreshold(existing.lowStockThreshold != null ? String(existing.lowStockThreshold) : '')
    setPublishOnline(existing.isPublishedOnline)
    setOnlineDescription(existing.onlineDescription ?? '')
    setOnlineReserve(existing.onlineStockReserve ? String(existing.onlineStockReserve) : '')
    setMetaTitle(existing.metaTitle ?? '')
    setMetaDescription(existing.metaDescription ?? '')
    setIsSerialized(existing.isSerialized)
    if (existing.serialType) setSerialType(existing.serialType)
    setWarrantyMonths(existing.warrantyMonths != null ? String(existing.warrantyMonths) : '')
    // openingStock is create-only; on edit, current stock is owned by Inventory.
    setLoaded(true)
  }, [editing, loaded, existing])

  // When the brand resolves: auto-pick its category if it has exactly one, and
  // resolve the model label for an already-set model id.
  useEffect(() => {
    if (!selectedBrand) return
    if (!categoryId && selectedBrand.categoryIds.length === 1) {
      const only = selectedBrand.categoryIds[0]!
      setCategoryId(only)
      setCategoryLabel(categories.find((c) => c.id === only)?.name ?? null)
    }
    if (modelId && !modelLabel) {
      setModelLabel(selectedBrand.models.find((m) => m.id === modelId)?.name ?? null)
    }
  }, [selectedBrand, categories])

  const onBrandChange = (value: string | null, option?: CommandSelectOption) => {
    setBrandId(value ?? '')
    setBrandLabel(option?.label ?? null)
    setCategoryId('')
    setCategoryLabel(null)
    setModelId('')
    setModelLabel(null)
  }

  // DB-backed loaders (search reaches SQLite/API, not just the loaded page).
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
          categories
            .filter((c) => ids.has(c.id) && c.name.toLowerCase().includes(q))
            .map((c) => ({ value: c.id, label: c.name })),
        )
      }
      // No brand → search all L3 categories in the DB.
      return dataClient.categories
        .list({ search: s, depth: 3, limit: 20 })
        .then((r) => r.data.map((c) => ({ value: c.id, label: c.name })))
    },
    [selectedBrand, categories],
  )

  const costN = Number(cost.replace(/\s/g, '')) || 0
  const priceN = Number(price.replace(/\s/g, '')) || 0
  const marginPct = priceN > 0 && costN > 0 ? ((priceN - costN) / priceN) * 100 : null
  const tracksInventory = productTypeV === 'SIMPLE' || productTypeV === 'VARIABLE_QUANTITY'
  const numOrU = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '')) : undefined)

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError(t('prodf.imageTypeError'))
      return
    }
    setImageError(null)
    setUploading(true)
    try {
      const bytes = await file.arrayBuffer()
      const res = await dataClient.uploads.file({ bytes, filename: file.name, contentType: file.type, folder: 'products' })
      setImageUrl(res.url)
    } catch {
      setImageError(t('prodf.imageError'))
    } finally {
      setUploading(false)
    }
  }

  const save = useMutation({
    mutationFn: async (input: ProductInput) => {
      const saved = editing && id ? await dataClient.products.update(id, input) : await dataClient.products.create(input)
      // Persist the gallery against the (now-existing) product id.
      await dataClient.products.setImages(saved.id, gallery)
      // Persist variants (SIMPLE products only) — matrix from the selected options.
      if (productTypeV === 'SIMPLE') {
        await dataClient.products.setVariants(
          saved.id,
          variantMatrix.map((m) => {
            const ov = variantOverrides[m.sig]
            const num = (s?: string) => (s?.trim() ? Number(s.replace(/\s/g, '')) : null)
            return {
              name: m.label,
              priceOverride: num(ov?.price),
              costPriceOverride: num(ov?.cost),
              openingStock: isSerialized ? 0 : num(ov?.stock) ?? 0,
              isActive: ov?.active !== false,
              options: m.options,
            }
          }),
        )
      }
      return saved
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      navigate('/products')
    },
    onError: () => setError(t('prodf.saveError')),
  })

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!name.trim()) return setError(t('prodf.nameRequired'))
    if (priceN <= 0) return setError(t('prodf.priceRequired'))
    if (!unitId) return setError(t('prodf.unitRequired'))
    // A variant product needs ≥2 variants (spec); 1 selected combination is invalid.
    if (productTypeV === 'SIMPLE' && variantMatrix.length === 1) return setError(t('prodf.variantsMinTwo'))
    setError(null)
    save.mutate({
      name: name.trim(),
      description: description.trim() || null,
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      sellingPrice: priceN,
      costPrice: cost.trim() ? costN : null,
      taxRate: taxable ? TVA_RATE : 0,
      unitOfMeasureId: unitId,
      categoryId: categoryId || null,
      brandId: brandId || null,
      modelId: modelId || null,
      metaTitle: metaTitle.trim() || null,
      metaDescription: metaDescription.trim() || null,
      imageUrl,
      productType: productTypeV,
      isService: productTypeV === 'SERVICE',
      isActive,
      isFeatured,
      isPublishedOnline: publishOnline,
      onlineDescription: onlineDescription.trim() || null,
      onlineStockReserve: numOrU(onlineReserve) ?? 0,
      isSerialized: tracksInventory ? isSerialized : false,
      serialType: tracksInventory && isSerialized ? serialType : null,
      warrantyMonths: tracksInventory && isSerialized ? (numOrU(warrantyMonths) ?? null) : null,
      openingStock: tracksInventory ? (numOrU(openingStock) ?? 0) : 0,
      lowStockThreshold: tracksInventory ? (numOrU(lowStockThreshold) ?? null) : null,
      reorderPoint: tracksInventory ? (numOrU(reorderPoint) ?? null) : null,
    })
  }

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
        <div className="acts2">
          <Button variant="soft" onClick={() => navigate('/products')} disabled={save.isPending}>
            {t('prodf.cancel')}
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => submit()}>
            {editing ? t('prodf.save') : t('prodf.create')}
          </Button>
        </div>
      </div>

      <div className="page-head">
        <div>
          <h1>{editing ? t('prodf.editTitle') : t('prodf.addTitle')}</h1>
          <p>{t('prodf.subtitle')}</p>
        </div>
      </div>

      <form className="formpage" onSubmit={submit}>
        <div className="fp-grid">
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="fsec-h">
                <span className="n">1</span>
                {t('prodf.basics')}
              </div>
              <div className="fform">
                <div className="ff">
                  <label className="lbl2">
                    {t('prodf.name')} <span className="req">*</span>
                  </label>
                  <Input value={name} placeholder={t('prodf.namePh')} onChange={(e) => { setName(e.target.value); setError(null) }} />
                </div>
                <div className="ff">
                  <label className="lbl2">{t('prodf.type')}</label>
                  <div className="seg-pick">
                    {PRODUCT_TYPES.map((pt) => (
                      <button key={pt} type="button" aria-pressed={pt === productTypeV} onClick={() => setProductTypeV(pt)}>
                        {t(`prodf.type_${pt}` as Parameters<typeof t>[0])}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-2col">
                  <div className="ff">
                    <label className="lbl2">{t('prodf.brand')}</label>
                    <CommandSelect
                      value={brandId || null}
                      valueLabel={brandLabel}
                      onChange={onBrandChange}
                      loadOptions={loadBrands}
                      placeholder={t('prodf.brandNone')}
                      searchPlaceholder={t('prodf.searchBrands')}
                      clearLabel={t('prodf.brandNone')}
                    />
                    <div className="hint">{t('prodf.brandHint')}</div>
                  </div>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.category')}</label>
                    <CommandSelect
                      value={categoryId || null}
                      valueLabel={categoryLabel}
                      onChange={(v, o) => { setCategoryId(v ?? ''); setCategoryLabel(o?.label ?? null) }}
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
                      value={modelId || null}
                      valueLabel={modelLabel}
                      onChange={(v, o) => { setModelId(v ?? ''); setModelLabel(o?.label ?? null) }}
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
                      value={unitId || null}
                      valueLabel={unitLabel}
                      onChange={(v, o) => { setUnitId(v ?? ''); setUnitLabel(o?.label ?? null); setError(null) }}
                      loadOptions={loadUnits}
                      placeholder={t('prodf.unitPick')}
                      searchPlaceholder={t('prodf.searchUnits')}
                      invalid={!!error && !unitId}
                    />
                  </div>
                </div>
                <div className="form-2col">
                  <div className="ff">
                    <label className="lbl2">{t('prodf.sku')}</label>
                    <Input value={sku} placeholder={t('prodf.skuPh')} onChange={(e) => setSku(e.target.value)} />
                  </div>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.barcode')}</label>
                    <Input value={barcode} placeholder={t('prodf.barcodePh')} onChange={(e) => setBarcode(e.target.value)} />
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
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="fsec-h">
                <span className="n">2</span>
                {t('prodf.pricing')}
              </div>
              <div className="fform">
                <div className="form-2col">
                  <div className="ff">
                    <label className="lbl2">{t('prodf.cost')}</label>
                    <Input value={cost} inputMode="decimal" placeholder="0" onChange={(e) => setCost(e.target.value)} />
                  </div>
                  <div className="ff">
                    <label className="lbl2">
                      {t('prodf.price')} <span className="req">*</span>
                    </label>
                    <Input value={price} inputMode="decimal" placeholder="0" onChange={(e) => { setPrice(e.target.value); setError(null) }} />
                  </div>
                </div>
                <div className="calc-row">
                  <span>{t('prodf.margin')}</span>
                  <span>
                    <span className="big">{marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}</span>
                    {marginPct != null ? <> · {XAF.format(priceN - costN)} FCFA</> : null}
                  </span>
                </div>
                <button
                  type="button"
                  className={`switch-line${taxable ? ' on' : ''}`}
                  onClick={() => setTaxable((v) => !v)}
                  aria-pressed={taxable}
                >
                  <span className={`switch${taxable ? ' on' : ''}`} />
                  <span>{t('prodf.taxable')}</span>
                </button>
              </div>
            </div>

            {productTypeV === 'SIMPLE' ? (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="fsec-h" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="n">V</span>
                    {t('prodf.variants')}
                  </span>
                  {variantMatrix.length > 0 ? <span className="chip-tag">{t('prodf.variantCount').replace('{n}', String(variantMatrix.length))}</span> : null}
                </div>
                {!categoryId ? (
                  <div className="form-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg><span>{t('prodf.variantsPickCategory')}</span></div>
                ) : categoryLinks.length === 0 ? (
                  <div className="form-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg><span>{t('prodf.variantsNoGroups')}</span></div>
                ) : (
                  <>
                    <div className="form-note" style={{ marginBottom: 10 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg><span>{t('prodf.variantsHint')}</span></div>
                    {categoryLinks.map((g) => (
                      <div className="ff" key={g.id} style={{ marginBottom: 10 }}>
                        <label className="lbl2">{g.name}</label>
                        <div className="attr-preview">
                          {g.options.map((o) => {
                            const on = (selectedOpts[g.attributeGroupId] ?? []).includes(o.id)
                            return (
                              <button
                                key={o.id}
                                type="button"
                                className={`vopt${on ? ' on' : ''}`}
                                onClick={() => toggleOpt(g.attributeGroupId, o.id)}
                              >
                                {o.colorHex ? <span className="vopt-sw" style={{ background: o.colorHex }} /> : null}
                                {o.value}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    {variantMatrix.length > 0 ? (
                      <div className="vmatrix">
                        <div className="vrow vrow-head">
                          <span className="vrow-name">{t('prodf.vColVariant').replace('{n}', String(variantMatrix.length))}</span>
                          <span className="vcol">{t('prodf.vColPrice')}</span>
                          <span className="vcol">{t('prodf.vColCost')}</span>
                          {!isSerialized ? <span className="vcol">{t('prodf.vColStock')}</span> : null}
                          <span className="vcol-sw">{t('prodf.vColInclude')}</span>
                        </div>
                        {variantMatrix.map((m) => {
                          const ov = variantOverrides[m.sig] ?? { price: '', cost: '', stock: '', active: true }
                          const set = (patch: Partial<typeof ov>) =>
                            setVariantOverrides((p) => ({ ...p, [m.sig]: { ...ov, ...patch } }))
                          return (
                            <div key={m.sig} className="vrow">
                              <span className="vrow-name">{m.label}</span>
                              <Input value={ov.price} inputMode="decimal" placeholder={price || t('prodf.basePrice')} onChange={(e) => set({ price: e.target.value })} style={{ height: 34 }} />
                              <Input value={ov.cost} inputMode="decimal" placeholder={cost || '0'} onChange={(e) => set({ cost: e.target.value })} style={{ height: 34 }} />
                              {!isSerialized ? (
                                <Input value={ov.stock} inputMode="numeric" placeholder="0" onChange={(e) => set({ stock: e.target.value })} style={{ height: 34 }} />
                              ) : null}
                              <button
                                type="button"
                                className={`switch${ov.active !== false ? ' on' : ''}`}
                                aria-pressed={ov.active !== false}
                                onClick={() => set({ active: !(ov.active !== false) })}
                              />
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {tracksInventory ? (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="fsec-h">
                  <span className="n">3</span>
                  {t('prodf.stock')}
                </div>
                <div className="fform">
                  <div className="form-2col">
                    <div className="ff">
                      <label className="lbl2">{editing ? t('prodf.lowStock') : t('prodf.openingStock')}</label>
                      {editing ? (
                        <Input value={lowStockThreshold} inputMode="numeric" placeholder="0" onChange={(e) => setLowStockThreshold(e.target.value)} />
                      ) : (
                        <Input value={openingStock} inputMode="numeric" placeholder="0" onChange={(e) => setOpeningStock(e.target.value)} />
                      )}
                    </div>
                    <div className="ff">
                      <label className="lbl2">{t('prodf.reorderPoint')}</label>
                      <Input value={reorderPoint} inputMode="numeric" placeholder="0" onChange={(e) => setReorderPoint(e.target.value)} />
                    </div>
                  </div>
                  {!editing ? <div className="hint">{t('prodf.lowStockHint')}</div> : null}
                </div>
              </div>
            ) : null}

            <div className="card" style={{ marginTop: 16 }}>
              <div className="fsec-h" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className="n">4</span>
                  {t('prodf.online')}
                </span>
              </div>
              <div className="set-line" style={{ paddingTop: 0 }}>
                <div className="t">
                  <div className="nm">{t('prodf.publish')}</div>
                  <div className="ds">{t('prodf.publishHint')}</div>
                </div>
                <button type="button" className={`switch${publishOnline ? ' on' : ''}`} aria-pressed={publishOnline} onClick={() => setPublishOnline((v) => !v)} />
              </div>
              {publishOnline ? (
                <div className="fform" style={{ marginTop: 12 }}>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.onlineDesc')} <span className="opt">SEO</span></label>
                    <textarea
                      className="input"
                      rows={2}
                      style={{ resize: 'vertical', paddingTop: 10 }}
                      placeholder={t('prodf.onlineDescPh')}
                      value={onlineDescription}
                      onChange={(e) => setOnlineDescription(e.target.value)}
                    />
                  </div>
                  {tracksInventory ? (
                    <div className="ff" style={{ maxWidth: 200 }}>
                      <label className="lbl2">{t('prodf.reserve')}</label>
                      <Input value={onlineReserve} inputMode="numeric" placeholder="0" onChange={(e) => setOnlineReserve(e.target.value)} />
                      <div className="hint">{t('prodf.reserveHint')}</div>
                    </div>
                  ) : null}
                  <div className="ff">
                    <label className="lbl2">{t('prodf.metaTitle')} <span className="opt">SEO</span></label>
                    <Input value={metaTitle} placeholder={name || t('prodf.metaTitlePh')} onChange={(e) => setMetaTitle(e.target.value)} />
                    <div className="hint">{t('prodf.metaTitleHint')}</div>
                  </div>
                  <div className="ff">
                    <label className="lbl2">{t('prodf.metaDescription')} <span className="opt">SEO</span></label>
                    <textarea
                      className="input"
                      rows={2}
                      style={{ resize: 'vertical', paddingTop: 10 }}
                      placeholder={t('prodf.metaDescriptionPh')}
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                    />
                    <div className="hint">{t('prodf.metaDescriptionHint')}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="fp-side">
            <div className="card">
              <div className="fsec-h" style={{ marginBottom: 10 }}>{t('prodf.image')}</div>
              <input ref={fileRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} style={{ display: 'none' }} onChange={onPickImage} />
              {imageUrl ? (
                <>
                  <div className="imgpreview">
                    <img src={imageUrl} alt={name || t('prodf.image')} />
                    {uploading ? <div className="imgpreview-overlay">{t('prodf.imageUploading')}</div> : null}
                  </div>
                  <div className="img-acts">
                    <Button variant="soft" type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {t('prodf.imageReplace')}
                    </Button>
                    <Button variant="soft" type="button" onClick={() => setImageUrl(null)} disabled={uploading}>
                      {t('prodf.imageRemove')}
                    </Button>
                  </div>
                </>
              ) : (
                <button type="button" className="imgdrop" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <div className="t">{uploading ? t('prodf.imageUploading') : t('prodf.imageUpload')}</div>
                  <div className="s">{t('prodf.imageHint')}</div>
                </button>
              )}
              {imageError ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">{imageError}</p> : null}

              <div className="gallery-head">
                <span>{t('prodf.gallery')}</span>
                <button type="button" className="gallery-add" onClick={() => galleryRef.current?.click()} disabled={uploading}>
                  + {t('prodf.galleryAdd')}
                </button>
              </div>
              <input ref={galleryRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} multiple style={{ display: 'none' }} onChange={onPickGallery} />
              {gallery.length === 0 ? (
                <div className="gallery-empty">{t('prodf.galleryEmpty')}</div>
              ) : (
                <div className="gallery-grid">
                  {gallery.map((g, i) => (
                    <div key={g.id ?? `new-${i}`} className="gallery-thumb">
                      <img src={g.url} alt="" />
                      <div className="gallery-acts">
                        <button type="button" title={t('prodf.setMain')} onClick={() => setImageUrl(g.url)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.6 9.1l5.8-.8L12 3Z" />
                          </svg>
                        </button>
                        <button type="button" title={t('prodf.galleryRemove')} onClick={() => setGallery((prev) => prev.filter((_, idx) => idx !== i))}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M6 6l12 12M18 6 6 18" />
                          </svg>
                        </button>
                      </div>
                      {imageUrl === g.url ? <span className="gallery-main-tag">{t('prodf.main')}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="set-line" style={{ paddingTop: 0 }}>
                <div className="t">
                  <div className="nm">{t('prodf.active')}</div>
                  <div className="ds">{t('prodf.activeHint')}</div>
                </div>
                <button type="button" className={`switch${isActive ? ' on' : ''}`} aria-pressed={isActive} onClick={() => setIsActive((v) => !v)} />
              </div>
              <div className="set-line" style={{ borderBottom: 0 }}>
                <div className="t">
                  <div className="nm">{t('prodf.featured')}</div>
                  <div className="ds">{t('prodf.featuredHint')}</div>
                </div>
                <button type="button" className={`switch${isFeatured ? ' on' : ''}`} aria-pressed={isFeatured} onClick={() => setIsFeatured((v) => !v)} />
              </div>
            </div>

            {productTypeV === 'SIMPLE' ? (
              <div className="card">
                <div className="set-line" style={{ paddingTop: 0, borderBottom: isSerialized ? '1px solid var(--border)' : 0 }}>
                  <div className="t">
                    <div className="nm">{t('prodf.serialized')}</div>
                    <div className="ds">{t('prodf.serializedHint')}</div>
                  </div>
                  <button type="button" className={`switch${isSerialized ? ' on' : ''}`} aria-pressed={isSerialized} onClick={() => setIsSerialized((v) => !v)} />
                </div>
                {isSerialized ? (
                  <div className="fform" style={{ marginTop: 12 }}>
                    <div className="ff">
                      <label className="lbl2">{t('prodf.serialType')}</label>
                      <div className="seg-pick">
                        {SERIAL_TYPES.map((st) => (
                          <button key={st} type="button" aria-pressed={st === serialType} onClick={() => setSerialType(st)}>
                            {t(`prodf.serial_${st}` as Parameters<typeof t>[0])}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ff" style={{ maxWidth: 160 }}>
                      <label className="lbl2">{t('prodf.warranty')}</label>
                      <Input value={warrantyMonths} inputMode="numeric" placeholder="0" onChange={(e) => setWarrantyMonths(e.target.value)} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">{error}</p> : null}

            <div className="fp-actions">
              <Button variant="soft" type="button" onClick={() => navigate('/products')} disabled={save.isPending}>
                {t('prodf.cancel')}
              </Button>
              <Button variant="primary" type="submit" loading={save.isPending}>
                {editing ? t('prodf.save') : t('prodf.create')}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
