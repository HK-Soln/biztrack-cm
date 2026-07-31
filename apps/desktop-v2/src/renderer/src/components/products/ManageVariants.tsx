import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  CommandSelect,
  ImageGallery,
  Input,
  Modal,
  Pagination,
} from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { ActionMenu, type ActionMenuItem } from '@/components/ActionMenu'
import { AdjustStockModal } from '@/components/inventory/AdjustStockModal'
import { VariantEditModal } from './VariantEditModal'
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
  const navigate = useNavigate()
  const id = product.id
  // A variant is managed on its own detail page.
  const openVariant = (variantId: string) => navigate(`/products/${id}/variants/${variantId}`)

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
  const [addLowStock, setAddLowStock] = useState('')
  const [addReorder, setAddReorder] = useState('')
  // The variant being edited — the form itself lives in the shared VariantEditModal.
  const [edit, setEdit] = useState<LocalVariant | null>(null)
  const [addSku, setAddSku] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [remove, setRemove] = useState<LocalVariant | null>(null)
  const [reason, setReason] = useState('')
  const [adjust, setAdjust] = useState<LocalVariant | null>(null)
  // New variant's images — a variant is a mini-product, so images can be attached at creation
  // (mirrors the create wizard). Committed after the variant row exists.
  const [addGallery, setAddGallery] = useState<ProductImageInput[]>([])
  const [addImgUploading, setAddImgUploading] = useState(false)

  const addM = useMutation({
    mutationFn: async (input: VariantInput) => {
      const created = await dataClient.products.addVariant(id, input)
      if (addGallery.length > 0) await dataClient.products.setImages(id, addGallery, created.id)
      return created
    },
    onSuccess: () => {
      setSel({})
      setOpening('')
      setAddSku('')
      setAddName('')
      setAddPrice('')
      setAddCost('')
      setAddLowStock('')
      setAddReorder('')
      setAddGallery([])
      setAddErr(null)
      setAddOpen(false)
      invalidate()
    },
    onError: (e) => setAddErr(errorMessage(e, t('pvar.addError'))),
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
    setAddLowStock('')
    setAddReorder('')
    setAddGallery([])
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
      lowStockThreshold: num(addLowStock),
      reorderPoint: num(addReorder),
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
  const openEdit = (v: LocalVariant) => setEdit(v)

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
                <button type="button" className="nm vlink" onClick={() => openVariant(v.id)}>
                  {v.name}
                  {v.sku ? <span className="vcode"> · {v.sku}</span> : null}
                </button>
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
                  <button type="button" className="nm vlink" onClick={() => openVariant(v.id)}>
                    {v.name}
                  </button>
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
            <Button
              variant="primary"
              loading={addM.isPending}
              disabled={addImgUploading}
              onClick={submitAdd}
            >
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
          <div className="ff" style={{ marginBottom: 10 }}>
            <label className="lbl2">{t('pvar.opening')}</label>
            <Input
              value={opening}
              inputMode="numeric"
              placeholder="0"
              onChange={(e) => setOpening(e.target.value)}
            />
          </div>
        ) : (
          <div className="hint" style={{ marginBottom: 10 }}>
            {t('pvar.serializedNote')}
          </div>
        )}
        <div className="form-2col">
          <div className="ff">
            <label className="lbl2">{t('prodf.lowStock')}</label>
            <Input
              value={addLowStock}
              inputMode="numeric"
              placeholder="0"
              onChange={(e) => setAddLowStock(e.target.value)}
            />
          </div>
          <div className="ff">
            <label className="lbl2">{t('prodf.reorderPoint')}</label>
            <Input
              value={addReorder}
              inputMode="numeric"
              placeholder="0"
              onChange={(e) => setAddReorder(e.target.value)}
            />
          </div>
        </div>

        {/* Variant images — first image is the cover; drag to reorder. */}
        <div className="ff" style={{ marginTop: 10 }}>
          <label className="lbl2">{t('pvar.images')}</label>
          <ImageGallery
            items={addGallery}
            onChange={setAddGallery}
            onUpload={uploadImage}
            onUploadingChange={setAddImgUploading}
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

        {addErr ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
            {addErr}
          </p>
        ) : null}
      </Modal>

      {/* Edit — the form lives in the shared VariantEditModal (also used by the variant page). */}
      <VariantEditModal
        productId={id}
        product={product}
        variant={edit}
        open={!!edit}
        onClose={() => setEdit(null)}
      />

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
