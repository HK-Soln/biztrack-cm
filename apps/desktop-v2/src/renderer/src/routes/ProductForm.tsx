import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input } from '@biztrack/ui/biztrack'
import type { CommandSelectOption } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import type { ProductInput } from '@shared/ipc'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const TVA_RATE = 19.25
const XAF = new Intl.NumberFormat('fr-CM', { maximumFractionDigits: 0 })

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
  const [isService, setIsService] = useState(false)
  const [unitId, setUnitId] = useState('')
  const [unitLabel, setUnitLabel] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(true)
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
    setIsService(existing.isService)
    setUnitId(existing.unitOfMeasureId ?? '')
    setUnitLabel(existing.unitAbbr)
    setImageUrl(existing.imageUrl)
    setIsActive(existing.isActive)
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
    mutationFn: (input: ProductInput) =>
      editing && id ? dataClient.products.update(id, input) : dataClient.products.create(input),
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
      imageUrl,
      isService,
      isActive,
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
            </div>

            <div className="card">
              <div className="set-line" style={{ paddingTop: 0 }}>
                <div className="t">
                  <div className="nm">{t('prodf.service')}</div>
                  <div className="ds">{t('prodf.serviceHint')}</div>
                </div>
                <button type="button" className={`switch${isService ? ' on' : ''}`} aria-pressed={isService} onClick={() => setIsService((v) => !v)} />
              </div>
              <div className="set-line" style={{ borderBottom: 0 }}>
                <div className="t">
                  <div className="nm">{t('prodf.active')}</div>
                  <div className="ds">{t('prodf.activeHint')}</div>
                </div>
                <button type="button" className={`switch${isActive ? ' on' : ''}`} aria-pressed={isActive} onClick={() => setIsActive((v) => !v)} />
              </div>
            </div>

            <div className="card">
              <div className="form-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" />
                </svg>
                <span>{t('prodf.deferredNote')}</span>
              </div>
            </div>

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
