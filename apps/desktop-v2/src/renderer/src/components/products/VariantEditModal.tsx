import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ImageGallery, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import type { LocalProduct, LocalVariant, ProductImageInput } from '@shared/ipc'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : null)
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

const EMPTY = {
  name: '',
  price: '',
  cost: '',
  sku: '',
  active: true,
  lowStock: '',
  reorder: '',
  description: '',
  metaTitle: '',
  metaDescription: '',
  onlineDescription: '',
  publishOnline: false,
}

/**
 * The single variant-edit surface — a variant is a mini-product, so this edits its info, pricing,
 * thresholds, description, SEO/online fields and image gallery. Shared by the variants list
 * (`ManageVariants`) and the variant detail page so the edit form lives in exactly one place.
 * Saves via `updateVariant` + `setImages` and invalidates the products cache.
 */
export function VariantEditModal({
  productId,
  product,
  variant,
  open,
  onClose,
}: {
  productId: string
  product: LocalProduct
  variant: LocalVariant | null
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const [fields, setFields] = useState(EMPTY)
  const [gallery, setGallery] = useState<ProductImageInput[]>([])
  const [imgUploading, setImgUploading] = useState(false)
  const loadedRef = useRef<string | null>(null)

  // Seed the form each time the modal opens for a variant.
  useEffect(() => {
    if (!open || !variant) return
    setFields({
      name: variant.name,
      price: variant.priceOverride != null ? String(variant.priceOverride) : '',
      cost: variant.costPriceOverride != null ? String(variant.costPriceOverride) : '',
      sku: variant.sku ?? '',
      active: variant.isActive,
      lowStock: variant.lowStockThreshold != null ? String(variant.lowStockThreshold) : '',
      reorder: variant.reorderPoint != null ? String(variant.reorderPoint) : '',
      description: variant.description ?? '',
      metaTitle: variant.metaTitle ?? '',
      metaDescription: variant.metaDescription ?? '',
      onlineDescription: variant.onlineDescription ?? '',
      publishOnline: variant.isPublishedOnline,
    })
    setGallery([])
    loadedRef.current = null
  }, [open, variant])

  // The variant's own gallery — seeded once per open, edited locally, saved with it.
  const images = useQuery({
    queryKey: [...queryKeys.products, 'variant-images', productId, variant?.id],
    queryFn: () => dataClient.products.listImages(productId, variant!.id),
    enabled: !!variant && open,
  })
  useEffect(() => {
    if (!variant || !images.data || loadedRef.current === variant.id) return
    loadedRef.current = variant.id
    setGallery(images.data.map((i) => ({ id: i.id, url: i.url, altText: i.altText })))
  }, [variant, images.data])

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

  const saveM = useMutation({
    mutationFn: async () => {
      if (!variant) return
      await dataClient.products.updateVariant(productId, variant.id, {
        name: fields.name.trim() || variant.name,
        sku: fields.sku.trim() || null,
        priceOverride: num(fields.price),
        costPriceOverride: num(fields.cost),
        isActive: fields.active,
        lowStockThreshold: num(fields.lowStock),
        reorderPoint: num(fields.reorder),
        description: fields.description.trim() || null,
        metaTitle: fields.metaTitle.trim() || null,
        metaDescription: fields.metaDescription.trim() || null,
        onlineDescription: fields.onlineDescription.trim() || null,
        isPublishedOnline: fields.publishOnline,
        options: variant.options,
      })
      await dataClient.products.setImages(productId, gallery, variant.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.products })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('pvar.editTitle')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={saveM.isPending}>
            {t('pvar.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={saveM.isPending}
            disabled={imgUploading}
            onClick={() => saveM.mutate()}
          >
            {t('pvar.save')}
          </Button>
        </>
      }
    >
      <div className="ff">
        <label className="lbl2">{t('pvar.name')}</label>
        <Input
          value={fields.name}
          onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
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
          value={fields.description}
          onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="ff" style={{ marginTop: 10 }}>
        <label className="lbl2">{t('pvar.code')}</label>
        <Input
          value={fields.sku}
          placeholder={t('pvar.codePh')}
          onChange={(e) => setFields((f) => ({ ...f, sku: e.target.value }))}
        />
      </div>
      <div className="form-2col" style={{ marginTop: 10 }}>
        <div className="ff">
          <label className="lbl2">{t('pvar.price')}</label>
          <Input
            value={fields.price}
            inputMode="decimal"
            placeholder={String(product.sellingPrice)}
            onChange={(e) => setFields((f) => ({ ...f, price: e.target.value }))}
          />
        </div>
        <div className="ff">
          <label className="lbl2">{t('pvar.cost')}</label>
          <Input
            value={fields.cost}
            inputMode="decimal"
            placeholder="0"
            onChange={(e) => setFields((f) => ({ ...f, cost: e.target.value }))}
          />
        </div>
      </div>
      <div className="form-2col" style={{ marginTop: 10 }}>
        <div className="ff">
          <label className="lbl2">{t('prodf.lowStock')}</label>
          <Input
            value={fields.lowStock}
            inputMode="numeric"
            placeholder="0"
            onChange={(e) => setFields((f) => ({ ...f, lowStock: e.target.value }))}
          />
        </div>
        <div className="ff">
          <label className="lbl2">{t('prodf.reorderPoint')}</label>
          <Input
            value={fields.reorder}
            inputMode="numeric"
            placeholder="0"
            onChange={(e) => setFields((f) => ({ ...f, reorder: e.target.value }))}
          />
        </div>
      </div>
      <button
        type="button"
        className={`switch-line${fields.active ? ' on' : ''}`}
        style={{ marginTop: 12 }}
        onClick={() => setFields((f) => ({ ...f, active: !f.active }))}
        aria-pressed={fields.active}
      >
        <span className={`switch${fields.active ? ' on' : ''}`} />
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
          className={`switch${fields.publishOnline ? ' on' : ''}`}
          aria-pressed={fields.publishOnline}
          onClick={() => setFields((f) => ({ ...f, publishOnline: !f.publishOnline }))}
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
          value={fields.onlineDescription}
          onChange={(e) => setFields((f) => ({ ...f, onlineDescription: e.target.value }))}
        />
      </div>
      <div className="ff" style={{ marginTop: 10 }}>
        <label className="lbl2">
          {t('prodf.metaTitle')} <span className="opt">SEO</span>
        </label>
        <Input
          value={fields.metaTitle}
          placeholder={fields.name || t('prodf.metaTitlePh')}
          onChange={(e) => setFields((f) => ({ ...f, metaTitle: e.target.value }))}
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
          value={fields.metaDescription}
          onChange={(e) => setFields((f) => ({ ...f, metaDescription: e.target.value }))}
        />
      </div>

      {/* Per-variant image gallery — first image is the cover; drag to reorder. */}
      <div className="ff" style={{ marginTop: 14 }}>
        <label className="lbl2">{t('pvar.images')}</label>
        <ImageGallery
          items={gallery}
          onChange={setGallery}
          onUpload={uploadImage}
          onUploadingChange={setImgUploading}
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
    </Modal>
  )
}
