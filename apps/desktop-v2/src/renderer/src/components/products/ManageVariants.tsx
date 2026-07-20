import { useState } from 'react'
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
import type { LocalProduct, LocalVariant, VariantInput } from '@shared/ipc'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : null)
const PAGE_SIZE = 5

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
  const [edit, setEdit] = useState<LocalVariant | null>(null)
  const [editFields, setEditFields] = useState({
    name: '',
    price: '',
    cost: '',
    sku: '',
    active: true,
  })
  const [addSku, setAddSku] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [remove, setRemove] = useState<LocalVariant | null>(null)
  const [reason, setReason] = useState('')
  const [adjust, setAdjust] = useState<LocalVariant | null>(null)

  const addM = useMutation({
    mutationFn: (input: VariantInput) => dataClient.products.addVariant(id, input),
    onSuccess: () => {
      setSel({})
      setOpening('')
      setAddSku('')
      setAddErr(null)
      setAddOpen(false)
      invalidate()
    },
    onError: (e) => setAddErr(errorMessage(e, t('pvar.addError'))),
  })
  const updateM = useMutation({
    mutationFn: (input: { variantId: string; data: VariantInput }) =>
      dataClient.products.updateVariant(id, input.variantId, input.data),
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

  const submitAdd = () => {
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
    addM.mutate({
      name,
      sku: addSku.trim() || null,
      openingStock: product.isSerialized ? 0 : (num(opening) ?? 0),
      isActive: true,
      options,
    })
  }
  const openEdit = (v: LocalVariant) => {
    setEdit(v)
    setEditFields({
      name: v.name,
      price: v.priceOverride != null ? String(v.priceOverride) : '',
      cost: v.costPriceOverride != null ? String(v.costPriceOverride) : '',
      sku: v.sku ?? '',
      active: v.isActive,
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
        options: edit.options,
      },
    })
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

  // A product "supports variants" only when its (leaf) category has attribute groups
  // linked (variants can't exist without them). Products that don't support variants show
  // no variants section at all. Base this on the (unfiltered) links so an active search
  // that returns nothing never hides the section. Render nothing until links settle.
  const supportsVariants = links.length > 0
  if (linksLoading || !supportsVariants) return null

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
        <Button
          variant="soft"
          onClick={() => {
            setSel({})
            setAddSku('')
            setOpening('')
            setAddErr(null)
            setAddOpen(true)
          }}
        >
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
        {links.map((g) => (
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
        ))}
        <div className="ff" style={{ marginBottom: 10 }}>
          <label className="lbl2">{t('pvar.code')}</label>
          <Input
            value={addSku}
            placeholder={t('pvar.codePh')}
            onChange={(e) => setAddSku(e.target.value)}
          />
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
