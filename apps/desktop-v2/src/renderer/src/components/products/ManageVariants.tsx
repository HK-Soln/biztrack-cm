import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Modal, Pagination } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { ActionMenu, type ActionMenuItem } from '@/components/ActionMenu'
import { AdjustStockModal } from '@/components/inventory/AdjustStockModal'
import type { LocalProduct, LocalVariant, ProductImageInput, VariantInput } from '@shared/ipc'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : null)
const PAGE_SIZE = 5
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/**
 * Manage a product's variants (movement-based). Add (opening stock → stock-in),
 * edit info (no movement), remove (write-off → stock-out, reason). Responsive:
 * table on desktop/tablet, cards on mobile.
 */
export function ManageVariants({ product }: { product: LocalProduct }) {
  const t = useT()
  const qc = useQueryClient()
  const bp = useBreakpoint()
  const money = useCurrency()
  const id = product.id

  // Variant management works in both builds — the cloud data-client mirrors the local calls.
  // The displayed list is paginated + searched by the BFF/API (5 per page); the renderer
  // never holds the full set.
  const {
    items: variants,
    total: totalVariants,
    page,
    totalPages,
    isPending: variantsLoading,
    setPage,
    search,
    setSearch,
  } = usePaged<LocalVariant>([...queryKeys.products, 'variants-page', id], (q) =>
    dataClient.products.listVariantsPage(id, { ...q, limit: PAGE_SIZE }),
  )
  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: queryKeys.categoryAttributeLinks(product.categoryId ?? 'none'),
    queryFn: () => dataClient.attributes.listCategoryLinks(product.categoryId!),
    enabled: !!product.categoryId,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.products })
  // Stock comes straight from the server — for serialized products it's the variant's
  // IN_STOCK serial count, otherwise the variant's own quantity (see the BFF/API hydrate).
  const variantStock = (v: LocalVariant) => v.stockQuantity

  const [sel, setSel] = useState<Record<string, string>>({})
  const [opening, setOpening] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)
  // Variants can be attribute-based (compose from Size/Colour) or free-form (a typed name).
  // 'attributes' mode is only offered when the category has groups.
  const [addMode, setAddMode] = useState<'attributes' | 'custom'>('custom')
  const [addName, setAddName] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [addCost, setAddCost] = useState('')
  const [edit, setEdit] = useState<LocalVariant | null>(null)
  const [editFields, setEditFields] = useState({
    name: '',
    price: '',
    cost: '',
    sku: '',
    active: true,
    description: '',
    metaTitle: '',
    metaDescription: '',
    onlineDescription: '',
    publishOnline: false,
  })
  const [addSku, setAddSku] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [remove, setRemove] = useState<LocalVariant | null>(null)
  const [reason, setReason] = useState('')
  const [adjust, setAdjust] = useState<LocalVariant | null>(null)
  // Per-variant image gallery (a variant is a mini-product with its own images).
  const [editGallery, setEditGallery] = useState<ProductImageInput[]>([])
  const [editImgUploading, setEditImgUploading] = useState(false)
  const editFileRef = useRef<HTMLInputElement>(null)
  const editImgLoadedRef = useRef<string | null>(null)

  const addM = useMutation({
    mutationFn: (input: VariantInput) => dataClient.products.addVariant(id, input),
    onSuccess: () => {
      setSel({})
      setOpening('')
      setAddSku('')
      setAddName('')
      setAddPrice('')
      setAddCost('')
      setAddErr(null)
      setAddOpen(false)
      invalidate()
    },
    onError: (e) => setAddErr(errorMessage(e, t('pvar.addError'))),
  })
  // The editing variant's own gallery — seeded once per open, edited locally, saved with it.
  const editImages = useQuery({
    queryKey: [...queryKeys.products, 'variant-images', id, edit?.id],
    queryFn: () => dataClient.products.listImages(id, edit!.id),
    enabled: !!edit,
  })
  useEffect(() => {
    if (!edit || !editImages.data || editImgLoadedRef.current === edit.id) return
    editImgLoadedRef.current = edit.id
    setEditGallery(editImages.data.map((i) => ({ id: i.id, url: i.url, altText: i.altText })))
  }, [edit, editImages.data])

  const updateM = useMutation({
    mutationFn: async (input: {
      variantId: string
      data: VariantInput
      images: ProductImageInput[]
    }) => {
      await dataClient.products.updateVariant(id, input.variantId, input.data)
      await dataClient.products.setImages(id, input.images, input.variantId)
    },
    onSuccess: () => {
      setEdit(null)
      invalidate()
    },
  })
  const removeM = useMutation({
    mutationFn: (input: { variantId: string; reason: string }) =>
      dataClient.products.removeVariant(id, input.variantId, input.reason),
    onSuccess: () => {
      setRemove(null)
      setReason('')
      invalidate()
    },
  })

  const openAdd = () => {
    setSel({})
    setAddSku('')
    setOpening('')
    setAddName('')
    setAddPrice('')
    setAddCost('')
    setAddErr(null)
    setAddMode(links.length > 0 ? 'attributes' : 'custom')
    setAddOpen(true)
  }

  const submitAdd = () => {
    const common = {
      sku: addSku.trim() || null,
      priceOverride: num(addPrice),
      costPriceOverride: num(addCost),
      openingStock: product.isSerialized ? 0 : (num(opening) ?? 0),
      isActive: true,
    }
    if (addMode === 'attributes') {
      if (links.some((g) => !sel[g.attributeGroupId])) return setAddErr(t('pvar.pickAll'))
      const options = links.map((g) => ({
        attributeGroupId: g.attributeGroupId,
        attributeOptionId: sel[g.attributeGroupId]!,
      }))
      // Duplicate combinations are enforced server-side (VARIANT_DUPLICATE_COMBINATION) — the
      // renderer only holds the current page, so it can't reliably pre-check here.
      const name = links
        .map((g) => g.options.find((o) => o.id === sel[g.attributeGroupId])?.value ?? '?')
        .join(' / ')
      addM.mutate({ ...common, name, options })
    } else {
      // Free-form variant: a typed name, no attribute options.
      if (!addName.trim()) return setAddErr(t('pvar.nameRequired'))
      addM.mutate({ ...common, name: addName.trim(), options: [] })
    }
  }
  const openEdit = (v: LocalVariant) => {
    editImgLoadedRef.current = null
    setEditGallery([])
    setEdit(v)
    setEditFields({
      name: v.name,
      price: v.priceOverride != null ? String(v.priceOverride) : '',
      cost: v.costPriceOverride != null ? String(v.costPriceOverride) : '',
      sku: v.sku ?? '',
      active: v.isActive,
      description: v.description ?? '',
      metaTitle: v.metaTitle ?? '',
      metaDescription: v.metaDescription ?? '',
      onlineDescription: v.onlineDescription ?? '',
      publishOnline: v.isPublishedOnline,
    })
  }
  const saveEdit = () => {
    if (!edit) return
    updateM.mutate({
      variantId: edit.id,
      data: {
        name: editFields.name.trim() || edit.name,
        sku: editFields.sku.trim() || null,
        priceOverride: num(editFields.price),
        costPriceOverride: num(editFields.cost),
        isActive: editFields.active,
        description: editFields.description.trim() || null,
        metaTitle: editFields.metaTitle.trim() || null,
        metaDescription: editFields.metaDescription.trim() || null,
        onlineDescription: editFields.onlineDescription.trim() || null,
        isPublishedOnline: editFields.publishOnline,
        options: edit.options,
      },
      images: editGallery,
    })
  }

  async function onPickVariantImage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const valid = files.filter((f) => ALLOWED_IMAGE_TYPES.includes(f.type))
    if (valid.length === 0) return
    setEditImgUploading(true)
    try {
      for (const file of valid) {
        const bytes = await file.arrayBuffer()
        const res = await dataClient.uploads.file({
          bytes,
          filename: file.name,
          contentType: file.type,
          folder: 'products',
        })
        setEditGallery((g) => [...g, { url: res.url }])
      }
    } finally {
      setEditImgUploading(false)
    }
  }

  const editIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="M14 6l4 4" />
    </svg>
  )
  const delIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  )
  const adjustIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12h6m6 0h6M9 6v12m6-12v12" />
    </svg>
  )

  const actions = (v: LocalVariant) => {
    const items: ActionMenuItem[] = [
      { label: t('pvar.edit'), icon: editIcon, onClick: () => openEdit(v) },
    ]
    // Non-serialized variants keep a plain stock balance we can adjust; serialized variants
    // change stock only by adding/removing serial units.
    if (!product.isSerialized) {
      items.push({ label: t('pvar.adjustStock'), icon: adjustIcon, onClick: () => setAdjust(v) })
    }
    items.push({
      label: t('pvar.remove'),
      icon: delIcon,
      danger: true,
      onClick: () => setRemove(v),
    })
    return <ActionMenu items={items} label={t('pvar.colActions')} />
  }
  const statusPill = (v: LocalVariant) =>
    v.isActive ? (
      <span className="st st-ok">
        <span className="d" />
        {t('prod.active')}
      </span>
    ) : (
      <span className="st st-neutral">{t('prod.inactive')}</span>
    )

  // Variants are optional and never forced: any product can have them. Attribute groups
  // (when the category has them) just power the "from options" generator; without groups the
  // user adds free-form variants. Wait for links to settle so the add modal knows which
  // modes to offer.
  if (linksLoading) return null

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-h">
        <div>
          <h3>{t('pvar.title')}</h3>
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{t('pvar.sub')}</p>
        </div>
        <span className="chip-tag">{totalVariants}</span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Button variant="soft" onClick={openAdd}>
          + {t('pvar.add')}
        </Button>
        {totalVariants > 0 || search ? (
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <Input
              value={search}
              placeholder={t('pvar.search')}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {variantsLoading ? null : variants.length === 0 ? (
        <div className="hint">{search ? t('pvar.noResults') : t('pvar.empty')}</div>
      ) : bp === 'mobile' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {variants.map((v) => (
            <div key={v.id} className="card" style={{ background: 'var(--inset)', padding: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span className="nm">
                  {v.name}
                  {v.sku ? <span className="vcode"> · {v.sku}</span> : null}
                </span>
                {statusPill(v)}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8,
                  fontSize: 12.5,
                  color: 'var(--text-2)',
                }}
              >
                <span>
                  {money.format(v.priceOverride ?? product.sellingPrice)} ·{' '}
                  {t('pvar.stockN').replace('{n}', String(variantStock(v)))}
                </span>
                {actions(v)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('pvar.colVariant')}</th>
              <th>{t('pvar.colCode')}</th>
              <th className="right">{t('pvar.colPrice')}</th>
              <th className="right">{t('pvar.colStock')}</th>
              <th>{t('prod.colStatus')}</th>
              <th className="right">{t('pvar.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id}>
                <td>
                  <span className="nm">{v.name}</span>
                </td>
                <td>
                  {v.sku ? (
                    <span className="vcode">{v.sku}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td className="right num">
                  {money.format(v.priceOverride ?? product.sellingPrice)}
                </td>
                <td className="right num">{variantStock(v)}</td>
                <td>{statusPill(v)}</td>
                <td className="right">{actions(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={totalVariants}
        limit={PAGE_SIZE}
        onPage={setPage}
        prevLabel={t('common.prev')}
        nextLabel={t('common.next')}
      />

      {/* Add variant modal. */}
      <Modal
        open={addOpen}
        onClose={() => {
          if (!addM.isPending) setAddOpen(false)
        }}
        title={t('pvar.addTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setAddOpen(false)} disabled={addM.isPending}>
              {t('pvar.cancel')}
            </Button>
            <Button variant="primary" loading={addM.isPending} onClick={submitAdd}>
              {t('pvar.add')}
            </Button>
          </>
        }
      >
        {/* Mode toggle only when the category offers attribute groups to combine. */}
        {links.length > 0 ? (
          <div className="seg-pick" style={{ marginBottom: 12 }}>
            <button
              type="button"
              aria-pressed={addMode === 'attributes'}
              onClick={() => {
                setAddMode('attributes')
                setAddErr(null)
              }}
            >
              {t('pvar.modeAttributes')}
            </button>
            <button
              type="button"
              aria-pressed={addMode === 'custom'}
              onClick={() => {
                setAddMode('custom')
                setAddErr(null)
              }}
            >
              {t('pvar.modeCustom')}
            </button>
          </div>
        ) : null}

        {addMode === 'attributes' ? (
          links.map((g) => (
            <div className="ff" key={g.id} style={{ marginBottom: 10 }}>
              <label className="lbl2">{g.name}</label>
              <CommandSelect
                value={sel[g.attributeGroupId] ?? null}
                valueLabel={g.options.find((o) => o.id === sel[g.attributeGroupId])?.value ?? null}
                placeholder={t('pvar.pick')}
                searchPlaceholder={t('pvar.searchOption')}
                onChange={(val) => {
                  setSel((p) => ({ ...p, [g.attributeGroupId]: val ?? '' }))
                  setAddErr(null)
                }}
                loadOptions={(s) =>
                  Promise.resolve(
                    g.options
                      .filter((o) => o.value.toLowerCase().includes(s.toLowerCase()))
                      .map((o) => ({ value: o.id, label: o.value })),
                  )
                }
              />
            </div>
          ))
        ) : (
          <div className="ff" style={{ marginBottom: 10 }}>
            <label className="lbl2">{t('pvar.name')}</label>
            <Input
              value={addName}
              placeholder={t('pvar.namePh')}
              onChange={(e) => {
                setAddName(e.target.value)
                setAddErr(null)
              }}
            />
          </div>
        )}

        <div className="ff" style={{ marginBottom: 10 }}>
          <label className="lbl2">{t('pvar.code')}</label>
          <Input
            value={addSku}
            placeholder={t('pvar.codePh')}
            onChange={(e) => setAddSku(e.target.value)}
          />
        </div>
        <div className="form-2col" style={{ marginBottom: 10 }}>
          <div className="ff">
            <label className="lbl2">{t('pvar.price')}</label>
            <Input
              value={addPrice}
              inputMode="decimal"
              placeholder={String(product.sellingPrice)}
              onChange={(e) => setAddPrice(e.target.value)}
            />
          </div>
          <div className="ff">
            <label className="lbl2">{t('pvar.cost')}</label>
            <Input
              value={addCost}
              inputMode="decimal"
              placeholder="0"
              onChange={(e) => setAddCost(e.target.value)}
            />
          </div>
        </div>
        {!product.isSerialized ? (
          <div className="ff">
            <label className="lbl2">{t('pvar.opening')}</label>
            <Input
              value={opening}
              inputMode="numeric"
              placeholder="0"
              onChange={(e) => setOpening(e.target.value)}
            />
          </div>
        ) : (
          <div className="hint">{t('pvar.serializedNote')}</div>
        )}
        {addErr ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
            {addErr}
          </p>
        ) : null}
      </Modal>

      {/* Edit info modal. */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={t('pvar.editTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setEdit(null)} disabled={updateM.isPending}>
              {t('pvar.cancel')}
            </Button>
            <Button variant="primary" loading={updateM.isPending} onClick={saveEdit}>
              {t('pvar.save')}
            </Button>
          </>
        }
      >
        <div className="ff">
          <label className="lbl2">{t('pvar.name')}</label>
          <Input
            value={editFields.name}
            onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="ff" style={{ marginTop: 10 }}>
          <label className="lbl2">
            {t('prodf.description')} <span className="opt">{t('prodf.optional')}</span>
          </label>
          <textarea
            className="input"
            rows={2}
            style={{ resize: 'vertical', paddingTop: 10 }}
            placeholder={t('prodf.descriptionPh')}
            value={editFields.description}
            onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="ff" style={{ marginTop: 10 }}>
          <label className="lbl2">{t('pvar.code')}</label>
          <Input
            value={editFields.sku}
            placeholder={t('pvar.codePh')}
            onChange={(e) => setEditFields((f) => ({ ...f, sku: e.target.value }))}
          />
        </div>
        <div className="form-2col" style={{ marginTop: 10 }}>
          <div className="ff">
            <label className="lbl2">{t('pvar.price')}</label>
            <Input
              value={editFields.price}
              inputMode="decimal"
              placeholder={String(product.sellingPrice)}
              onChange={(e) => setEditFields((f) => ({ ...f, price: e.target.value }))}
            />
          </div>
          <div className="ff">
            <label className="lbl2">{t('pvar.cost')}</label>
            <Input
              value={editFields.cost}
              inputMode="decimal"
              placeholder="0"
              onChange={(e) => setEditFields((f) => ({ ...f, cost: e.target.value }))}
            />
          </div>
        </div>
        <button
          type="button"
          className={`switch-line${editFields.active ? ' on' : ''}`}
          style={{ marginTop: 12 }}
          onClick={() => setEditFields((f) => ({ ...f, active: !f.active }))}
          aria-pressed={editFields.active}
        >
          <span className={`switch${editFields.active ? ' on' : ''}`} />
          <span>{t('pvar.active')}</span>
        </button>

        {/* Online store / SEO — a variant is a mini-product with its own online presence. */}
        <div className="set-line" style={{ marginTop: 4 }}>
          <div className="t">
            <div className="nm">{t('prodf.publishOnline')}</div>
            <div className="ds">{t('prodf.publishOnlineHint')}</div>
          </div>
          <button
            type="button"
            className={`switch${editFields.publishOnline ? ' on' : ''}`}
            aria-pressed={editFields.publishOnline}
            onClick={() => setEditFields((f) => ({ ...f, publishOnline: !f.publishOnline }))}
          />
        </div>
        <div className="ff" style={{ marginTop: 10 }}>
          <label className="lbl2">
            {t('prodf.onlineDesc')} <span className="opt">SEO</span>
          </label>
          <textarea
            className="input"
            rows={2}
            style={{ resize: 'vertical', paddingTop: 10 }}
            placeholder={t('prodf.onlineDescPh')}
            value={editFields.onlineDescription}
            onChange={(e) => setEditFields((f) => ({ ...f, onlineDescription: e.target.value }))}
          />
        </div>
        <div className="ff" style={{ marginTop: 10 }}>
          <label className="lbl2">
            {t('prodf.metaTitle')} <span className="opt">SEO</span>
          </label>
          <Input
            value={editFields.metaTitle}
            placeholder={editFields.name || t('prodf.metaTitlePh')}
            onChange={(e) => setEditFields((f) => ({ ...f, metaTitle: e.target.value }))}
          />
        </div>
        <div className="ff" style={{ marginTop: 10 }}>
          <label className="lbl2">
            {t('prodf.metaDescription')} <span className="opt">SEO</span>
          </label>
          <textarea
            className="input"
            rows={2}
            style={{ resize: 'vertical', paddingTop: 10 }}
            placeholder={t('prodf.metaDescriptionPh')}
            value={editFields.metaDescription}
            onChange={(e) => setEditFields((f) => ({ ...f, metaDescription: e.target.value }))}
          />
        </div>

        {/* Per-variant image gallery. */}
        <div className="ff" style={{ marginTop: 14 }}>
          <div className="gallery-head">
            <span>{t('pvar.images')}</span>
            <button
              type="button"
              className="gallery-add"
              onClick={() => editFileRef.current?.click()}
              disabled={editImgUploading}
            >
              + {t('prodf.galleryAdd')}
            </button>
          </div>
          <input
            ref={editFileRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            multiple
            style={{ display: 'none' }}
            onChange={onPickVariantImage}
          />
          {editGallery.length === 0 ? (
            <div className="gallery-empty">
              {editImgUploading ? t('prodf.imageUploading') : t('pvar.imagesEmpty')}
            </div>
          ) : (
            <div className="gallery-grid">
              {editGallery.map((g, i) => (
                <div key={g.id ?? `new-${i}`} className="gallery-thumb">
                  <img src={g.url} alt="" />
                  <div className="gallery-acts">
                    <button
                      type="button"
                      title={t('prodf.galleryRemove')}
                      onClick={() => setEditGallery((gg) => gg.filter((_, idx) => idx !== i))}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Remove (write-off) modal. */}
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title={t('pvar.removeTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setRemove(null)} disabled={removeM.isPending}>
              {t('pvar.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={removeM.isPending}
              disabled={reason.trim().length < 3}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() =>
                remove && removeM.mutate({ variantId: remove.id, reason: reason.trim() })
              }
            >
              {t('pvar.remove')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
          {t('pvar.removeBody')
            .replace('{name}', remove?.name ?? '')
            .replace('{n}', String(remove ? variantStock(remove) : 0))}
        </p>
        <label className="lbl2">{t('pvar.reason')}</label>
        <Input
          value={reason}
          placeholder={t('pvar.reasonPh')}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>

      {/* Adjust variant stock (non-serialized). */}
      <AdjustStockModal
        product={product}
        variant={
          adjust ? { id: adjust.id, name: adjust.name, stock: variantStock(adjust) } : undefined
        }
        open={!!adjust}
        onClose={() => setAdjust(null)}
      />
    </div>
  )
}
