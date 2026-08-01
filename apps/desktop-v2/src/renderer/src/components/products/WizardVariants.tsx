import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, CommandSelect, ImageGallery, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { WizardSerials } from './WizardSerials'
import { emptyDraftVariant, type DraftVariant } from './wizardTypes'
import type { SerialType } from '@shared/ipc'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)

/**
 * In-memory variant editor for the create wizard. Variants are built locally (no network) and
 * committed by the wizard shell after the product is created. A variant is a mini-product: it
 * carries price/cost/sku, its own image gallery, and — for serialized products — its own serial
 * numbers (its stock = that count). Attribute-based add is offered when the category has groups;
 * free-form add is always available.
 */
export function WizardVariants({
  categoryId,
  serialized,
  serialType,
  variants,
  onChange,
}: {
  categoryId: string | null
  serialized: boolean
  serialType: SerialType
  variants: DraftVariant[]
  onChange: (next: DraftVariant[]) => void
}) {
  const t = useT()
  const money = useCurrency()

  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: queryKeys.categoryAttributeLinks(categoryId ?? 'none'),
    queryFn: () => dataClient.attributes.listCategoryLinks(categoryId!),
    enabled: !!categoryId,
  })

  // The variant being added/edited (a working copy committed on Save).
  const [form, setForm] = useState<DraftVariant | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [mode, setMode] = useState<'attributes' | 'custom'>('custom')
  const [sel, setSel] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const stockOf = (v: DraftVariant) => (serialized ? v.serials.length : (num(v.openingStock) ?? 0))

  const openAdd = () => {
    const key =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `v-${Date.now()}-${variants.length}`
    setForm(emptyDraftVariant(key))
    setIsNew(true)
    setMode(links.length > 0 ? 'attributes' : 'custom')
    setSel({})
    setErr(null)
  }
  const openEdit = (v: DraftVariant) => {
    setForm({ ...v })
    setIsNew(false)
    setMode('custom')
    setSel({})
    setErr(null)
  }

  const patchForm = (p: Partial<DraftVariant>) => setForm((f) => (f ? { ...f, ...p } : f))

  const save = () => {
    if (!form) return
    let next: DraftVariant = form
    if (isNew && mode === 'attributes') {
      if (links.some((g) => !sel[g.attributeGroupId])) return setErr(t('pvar.pickAll'))
      const options = links.map((g) => ({
        attributeGroupId: g.attributeGroupId,
        attributeOptionId: sel[g.attributeGroupId]!,
      }))
      const name = links
        .map((g) => g.options.find((o) => o.id === sel[g.attributeGroupId])?.value ?? '?')
        .join(' / ')
      next = { ...form, name, options }
    } else if (!form.name.trim()) {
      return setErr(t('pvar.nameRequired'))
    }
    if (num(next.price) <= 0) return setErr(t('pwiz.variantPriceRequired'))
    // Dedupe by name within the draft (server also enforces unique combinations at save).
    const clash = variants.some(
      (v) => v.key !== next.key && v.name.trim().toLowerCase() === next.name.trim().toLowerCase(),
    )
    if (clash) return setErr(t('pwiz.variantDuplicate'))

    onChange(isNew ? [...variants, next] : variants.map((v) => (v.key === next.key ? next : v)))
    setForm(null)
  }

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

  if (linksLoading) return null

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <Button variant="soft" onClick={openAdd}>
          + {t('pvar.add')}
        </Button>
        <span className="chip-tag">{variants.length}</span>
      </div>

      {variants.length === 0 ? (
        <div className="hint">{t('pwiz.variantsEmpty')}</div>
      ) : (
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('pvar.colVariant')}</th>
              <th>{t('pvar.colCode')}</th>
              <th className="right">{t('pvar.colPrice')}</th>
              <th className="right">{serialized ? t('pwiz.colUnits') : t('pvar.colStock')}</th>
              <th className="right">{t('pvar.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.key}>
                <td>
                  <span className="nm">{v.name}</span>
                  {v.gallery.length > 0 ? (
                    <span className="vcode">
                      {' '}
                      · {t('pwiz.imagesN').replace('{n}', String(v.gallery.length))}
                    </span>
                  ) : null}
                </td>
                <td>
                  {v.sku ? (
                    <span className="vcode">{v.sku}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td className="right num">{money.format(num(v.price))}</td>
                <td className="right num">{stockOf(v)}</td>
                <td className="right">
                  <span
                    className="acts"
                    style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end' }}
                  >
                    <button type="button" title={t('pvar.edit')} onClick={() => openEdit(v)}>
                      {editIcon}
                    </button>
                    <button
                      type="button"
                      title={t('pvar.remove')}
                      style={{ color: 'var(--danger)' }}
                      onClick={() => onChange(variants.filter((x) => x.key !== v.key))}
                    >
                      {delIcon}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={isNew ? t('pvar.addTitle') : t('pvar.editTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setForm(null)}>
              {t('pvar.cancel')}
            </Button>
            <Button variant="primary" onClick={save} disabled={uploading}>
              {isNew ? t('pvar.add') : t('pvar.save')}
            </Button>
          </>
        }
      >
        {form ? (
          <>
            {/* Attribute vs free-form — only when adding and the category has groups. */}
            {isNew && links.length > 0 ? (
              <div className="seg-pick" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  aria-pressed={mode === 'attributes'}
                  onClick={() => {
                    setMode('attributes')
                    setErr(null)
                  }}
                >
                  {t('pvar.modeAttributes')}
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'custom'}
                  onClick={() => {
                    setMode('custom')
                    setErr(null)
                  }}
                >
                  {t('pvar.modeCustom')}
                </button>
              </div>
            ) : null}

            {isNew && mode === 'attributes' ? (
              links.map((g) => (
                <div className="ff" key={g.id} style={{ marginBottom: 10 }}>
                  <label className="lbl2">{g.name}</label>
                  <CommandSelect
                    value={sel[g.attributeGroupId] ?? null}
                    valueLabel={
                      g.options.find((o) => o.id === sel[g.attributeGroupId])?.value ?? null
                    }
                    placeholder={t('pvar.pick')}
                    searchPlaceholder={t('pvar.searchOption')}
                    onChange={(val) => {
                      setSel((p) => ({ ...p, [g.attributeGroupId]: val ?? '' }))
                      setErr(null)
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
                  value={form.name}
                  placeholder={t('pvar.namePh')}
                  onChange={(e) => {
                    patchForm({ name: e.target.value })
                    setErr(null)
                  }}
                />
              </div>
            )}

            <div className="ff" style={{ marginBottom: 10 }}>
              <label className="lbl2">{t('pvar.code')}</label>
              <Input
                value={form.sku}
                placeholder={t('pvar.codePh')}
                onChange={(e) => patchForm({ sku: e.target.value })}
              />
            </div>
            <div className="form-2col" style={{ marginBottom: 10 }}>
              <div className="ff">
                <label className="lbl2">
                  {t('pvar.price')} <span className="req">*</span>
                </label>
                <Input
                  value={form.price}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => {
                    patchForm({ price: e.target.value })
                    setErr(null)
                  }}
                />
              </div>
              <div className="ff">
                <label className="lbl2">{t('pvar.cost')}</label>
                <Input
                  value={form.cost}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => patchForm({ cost: e.target.value })}
                />
              </div>
            </div>

            {/* Stock: a plain opening quantity, or (serialized) this variant's own serial units. */}
            {serialized ? (
              <div className="ff" style={{ marginBottom: 10 }}>
                <label className="lbl2">{t('pwiz.variantSerials')}</label>
                <WizardSerials
                  serialType={serialType}
                  serials={form.serials}
                  onChange={(next) => patchForm({ serials: next })}
                  compact
                />
              </div>
            ) : (
              <div className="form-2col" style={{ marginBottom: 10 }}>
                <div className="ff">
                  <label className="lbl2">{t('pvar.opening')}</label>
                  <Input
                    value={form.openingStock}
                    inputMode="numeric"
                    placeholder="0"
                    onChange={(e) => patchForm({ openingStock: e.target.value })}
                  />
                </div>
                <div className="ff" />
              </div>
            )}

            {/* Stock alert thresholds — per variant, for both serialized and non-serialized. */}
            <div className="form-2col" style={{ marginBottom: 10 }}>
              <div className="ff">
                <label className="lbl2">{t('prodf.lowStock')}</label>
                <Input
                  value={form.lowStockThreshold}
                  inputMode="numeric"
                  placeholder="0"
                  onChange={(e) => patchForm({ lowStockThreshold: e.target.value })}
                />
              </div>
              <div className="ff">
                <label className="lbl2">{t('prodf.reorderPoint')}</label>
                <Input
                  value={form.reorderPoint}
                  inputMode="numeric"
                  placeholder="0"
                  onChange={(e) => patchForm({ reorderPoint: e.target.value })}
                />
              </div>
            </div>

            {/* Per-variant image gallery — first image is the cover; drag to reorder. */}
            <div className="ff" style={{ marginTop: 4 }}>
              <label className="lbl2">{t('pvar.images')}</label>
              <ImageGallery
                items={form.gallery}
                onChange={(next) => patchForm({ gallery: next })}
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

            {err ? (
              <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
                {err}
              </p>
            ) : null}
          </>
        ) : null}
      </Modal>
    </div>
  )
}
