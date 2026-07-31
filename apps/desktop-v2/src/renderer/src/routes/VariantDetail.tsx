import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BackButton, Button, ImageCarousel, Input, Modal, Pagination } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useCurrency } from '@/lib/currency'
import { MV_PILL, formatMovementDate } from '@/lib/movements'
import { useT } from '@/i18n'
import { ManageSerialUnits } from '@/components/products/ManageSerialUnits'
import { VariantEditModal } from '@/components/products/VariantEditModal'
import { AdjustStockModal } from '@/components/inventory/AdjustStockModal'
import { MovementHistoryModal } from '@/components/inventory/MovementHistoryModal'

const RELATED_PAGE_SIZE = 8
const MOVE_PREVIEW = 5

export function VariantDetail() {
  const t = useT()
  const navigate = useNavigate()
  const money = useCurrency()
  const bp = useBreakpoint()
  const qc = useQueryClient()
  const { productId, variantId } = useParams()
  const [editOpen, setEditOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [carousel, setCarousel] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [relatedPage, setRelatedPage] = useState(1)

  const { data: product, isPending: productPending } = useQuery({
    queryKey: [...queryKeys.products, 'one', productId],
    queryFn: () => dataClient.products.get(productId!),
    enabled: !!productId,
  })
  // The current variant is derived from the (small) hydrated variants list — no extra API.
  const { data: variants, isPending: variantsPending } = useQuery({
    queryKey: [...queryKeys.products, 'variants', productId],
    queryFn: () => dataClient.products.listVariants(productId!),
    enabled: !!productId,
  })
  const variant = variants?.find((v) => v.id === variantId) ?? null

  const { data: images = [] } = useQuery({
    queryKey: [...queryKeys.products, 'images', productId, variantId],
    queryFn: () => dataClient.products.listImages(productId!, variantId!),
    enabled: !!productId && !!variantId,
  })

  // This variant's recent stock movements (newest first) for the bin card preview.
  const { data: movementsPage } = useQuery({
    queryKey: [...queryKeys.products, 'variant-movements', productId, variantId],
    queryFn: () =>
      dataClient.inventory.listMovements(productId!, {
        variantId: variantId!,
        limit: MOVE_PREVIEW,
      }),
    enabled: !!productId && !!variantId && !!product?.trackInventory,
  })
  const movements = movementsPage?.data ?? []
  const movementsTotal = movementsPage?.total ?? 0

  // Related variants — the product's OTHER variants (excludes the one being viewed), client-paged.
  const siblings = useMemo(
    () => (variants ?? []).filter((rv) => rv.id !== variantId),
    [variants, variantId],
  )
  const relatedTotalPages = Math.max(1, Math.ceil(siblings.length / RELATED_PAGE_SIZE))
  const relatedItems = siblings.slice(
    (relatedPage - 1) * RELATED_PAGE_SIZE,
    relatedPage * RELATED_PAGE_SIZE,
  )

  const removeM = useMutation({
    mutationFn: () => dataClient.products.removeVariant(productId!, variantId!, reason.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      navigate(`/products/${productId}`)
    },
  })

  if (productPending || variantsPending)
    return (
      <div className="frame">
        <div className="cat-empty">{t('pdv.loading')}</div>
      </div>
    )
  if (!product || !variant)
    return (
      <div className="frame">
        <div className="cat-empty">{t('pdv.notFound')}</div>
      </div>
    )

  const p = product
  const v = variant
  const effPrice = v.priceOverride ?? p.sellingPrice
  const effCost = v.costPriceOverride ?? p.costPrice ?? null
  const stock = v.stockQuantity
  const threshold = v.reorderPoint ?? v.lowStockThreshold ?? 0
  const stockValue = (effCost ?? 0) * stock
  const unitMargin = effCost != null && effCost > 0 && effPrice > 0 ? effPrice - effCost : null
  const marginPct = unitMargin != null && effPrice > 0 ? (unitMargin / effPrice) * 100 : null
  // Non-serialized variants hold a plain quantity that can be adjusted; serialized variants
  // change stock only by adding/retiring serial units below.
  const canAdjust = p.trackInventory && !p.isSerialized
  const coverImage = images[0]?.url ?? null
  const relatedCols = bp === 'mobile' ? 2 : bp === 'tablet' ? 3 : 4

  const statusPill = v.isActive ? (
    <span className="st st-brand">{t('prod.active')}</span>
  ) : (
    <span className="st st-neutral">{t('prod.inactive')}</span>
  )

  return (
    <div className="frame">
      <div className="detail-top">
        <BackButton onClick={() => navigate(`/products/${p.id}`)}>
          {t('vdv.backToProduct')}
        </BackButton>
        <div className="acts2">
          {canAdjust ? (
            <Button variant="default" onClick={() => setAdjustOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 20h9M3 20l4-1L18 8l-3-3L4 16l-1 4Z" />
              </svg>
              {t('pdv.adjustStock')}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => setEditOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
              <path d="M14 6l4 4" />
            </svg>
            {t('pdv.edit')}
          </Button>
          <Button
            variant="soft"
            onClick={() => setRemoveOpen(true)}
            style={{ color: 'var(--danger)' }}
            title={t('pvar.remove')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
            </svg>
            {t('pvar.remove')}
          </Button>
        </div>
      </div>

      <div className="dhero">
        <div className="dhero-in">
          <div className="av">
            {coverImage ? <img src={coverImage} alt="" /> : v.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{p.name}</div>
            <h1>{v.name}</h1>
            {v.description ? <p className="desc">{v.description}</p> : null}
            <div className="badges">
              {statusPill}
              {v.sku ? (
                <span className="chip-tag">
                  {t('pdv.sku')} {v.sku}
                </span>
              ) : null}
              {p.isSerialized ? <span className="chip-tag">{t('pdv.serialized')}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="metrics">
        <div className="mc">
          <div className="l">{t('pdv.onHand')}</div>
          <div className="v">{t('pdv.units').replace('{n}', String(stock))}</div>
          <div className="s">
            {threshold > 0
              ? t('pdv.threshold').replace('{n}', String(threshold))
              : t('pdv.noThreshold')}
          </div>
        </div>
        <div className="mc">
          <div className="l">{t('pdv.stockValue')}</div>
          <div className="v">{money.format(stockValue)}</div>
          <div className="s">{t('pdv.atCost')}</div>
        </div>
        <div className="mc">
          <div className="l">{t('pdv.unitMargin')}</div>
          <div className={`v${marginPct != null ? ' ok' : ''}`}>
            {marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}
          </div>
          <div className="s">
            {unitMargin != null ? t('pdv.perUnit').replace('{v}', money.format(unitMargin)) : '—'}
          </div>
        </div>
      </div>

      <div className="split mb20">
        <div className="card">
          <div className="card-h">
            <div>
              <h3>{t('pdv.details')}</h3>
            </div>
          </div>
          <div className="fields-grid">
            <div className="fld">
              <div className="fl">{t('pdv.sku')}</div>
              <div className="fv">{v.sku || t('pdv.none')}</div>
            </div>
            <div className="fld">
              <div className="fl">{t('pdv.unit')}</div>
              <div className="fv">{p.unitAbbr || t('pdv.none')}</div>
            </div>
            <div className="fld">
              <div className="fl">{t('pdv.category')}</div>
              <div className="fv">{p.categoryName || t('pdv.none')}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <h3>{t('pdv.pricing')}</h3>
            </div>
          </div>
          <div className="kv">
            <div className="row">
              <span>{t('pdv.sellingPrice')}</span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                {money.format(effPrice)}
              </span>
            </div>
            <div className="row">
              <span>{t('pdv.cost')}</span>
              <span className="neg">{effCost != null ? `−${money.format(effCost)}` : '—'}</span>
            </div>
            <div className="row total">
              <span>{t('pdv.margin')}</span>
              <span>{unitMargin != null ? money.format(unitMargin) : '—'}</span>
            </div>
          </div>
          {marginPct != null ? (
            <div style={{ marginTop: 14 }}>
              <div
                className="pay-top"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: 'var(--text-2)',
                }}
              >
                <span>{t('pdv.marginLabel')}</span>
                <span>{marginPct.toFixed(1)}%</span>
              </div>
              <div className="mbar" style={{ marginTop: 6 }}>
                <div
                  className="mbar-fill"
                  style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Stock movements — this variant's own ledger (bin summary + recent + view all). */}
      {p.trackInventory ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="binhead">
            <div className="t">
              {t('pdv.stockOnHand')}
              <p>{t('pdv.binSub')}</p>
            </div>
            <div className="big">
              {stock}
              <small>
                {threshold > 0
                  ? t('pdv.unitsReorder').replace('{n}', String(threshold))
                  : t('pdv.unitsOnly')}
              </small>
            </div>
          </div>
          <div className="binmeta">
            <div className="c">
              <div className="l">{t('pdv.reorderPt')}</div>
              <div className="v">{threshold > 0 ? threshold : '—'}</div>
            </div>
          </div>
          {movements.length === 0 ? (
            <div className="bin-empty">{t('pdv.noMovements')}</div>
          ) : (
            <>
              <table className="ltbl">
                <thead>
                  <tr>
                    <th>{t('pdv.mvDate')}</th>
                    <th>{t('pdv.mvMovement')}</th>
                    <th>{t('pdv.mvReference')}</th>
                    <th className="right">{t('pdv.mvChange')}</th>
                    <th className="right">{t('pdv.mvBalance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const positive = m.quantityChange >= 0
                    return (
                      <tr key={m.id}>
                        <td className="num">{formatMovementDate(m.createdAt)}</td>
                        <td>
                          <span className={`et ${MV_PILL[m.type] ?? 'et-sale'}`}>
                            {t(`pdv.mv_${m.type}` as Parameters<typeof t>[0])}
                          </span>
                        </td>
                        <td>
                          {m.type === 'OPENING_STOCK'
                            ? t('pdv.mvInitial')
                            : m.notes || t('pdv.none')}
                        </td>
                        <td className={`right ${positive ? 't-credit' : 't-debit'}`}>
                          {positive ? '+' : '−'}
                          {Math.abs(m.quantityChange)}
                        </td>
                        <td className="right t-bal">{m.quantityAfter}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="panel-foot">
                <span>
                  {movementsTotal > MOVE_PREVIEW
                    ? t('pdv.mvShowingOf')
                        .replace('{n}', String(MOVE_PREVIEW))
                        .replace('{total}', String(movementsTotal))
                    : t('pdv.mvShowing').replace('{n}', String(movements.length))}
                </span>
                <div className="spacer" />
                {movementsTotal > MOVE_PREVIEW ? (
                  <span
                    className="link"
                    role="button"
                    tabIndex={0}
                    onClick={() => setHistoryOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setHistoryOpen(true)
                    }}
                  >
                    {t('pdv.mvViewAll')}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Serial units — this variant's own units (serialized products). */}
      {p.isSerialized ? (
        <ManageSerialUnits product={p} variant={{ id: v.id, name: v.name, stock }} />
      ) : null}

      {/* Gallery — variant images. */}
      {images.length > 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h">
            <div>
              <h3>{t('pdv.gallery')}</h3>
            </div>
            <span className="chip-tag">{images.length}</span>
          </div>
          {(() => {
            const cols = bp === 'mobile' ? 3 : bp === 'tablet' ? 4 : 5
            const overflow = images.length > cols
            const visible = overflow ? images.slice(0, cols - 1) : images
            const moreFrom = cols - 1
            const moreCount = images.length - moreFrom
            return (
              <div
                className="detail-gallery"
                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
              >
                {visible.map((g, i) => (
                  <button
                    key={g.id}
                    type="button"
                    className="dg-tile"
                    onClick={() => setCarousel(i)}
                  >
                    <img src={g.url} alt="" />
                  </button>
                ))}
                {overflow ? (
                  <button
                    type="button"
                    className="dg-tile dg-more"
                    onClick={() => setCarousel(moreFrom)}
                  >
                    <img src={images[moreFrom]!.url} alt="" />
                    <span className="dg-more-ov">
                      +{moreCount} {t('pdv.more')}
                    </span>
                  </button>
                ) : null}
              </div>
            )
          })()}
        </div>
      ) : null}

      {/* Online / SEO — a variant is a mini-product with its own online presence. */}
      {v.isPublishedOnline ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h">
            <div>
              <h3>{t('pdv.onlineSeo')}</h3>
            </div>
            <span className="chip-tag">{t('pdv.online')}</span>
          </div>
          <div className="fields-grid">
            <div className="fld">
              <div className="fl">{t('prodf.metaTitle')}</div>
              <div className="fv">{v.metaTitle || t('pdv.none')}</div>
            </div>
            <div className="fld" style={{ gridColumn: '1 / -1' }}>
              <div className="fl">{t('prodf.onlineDesc')}</div>
              <div className="fv">{v.onlineDescription || v.description || t('pdv.none')}</div>
            </div>
            <div className="fld" style={{ gridColumn: '1 / -1' }}>
              <div className="fl">{t('prodf.metaDescription')}</div>
              <div className="fv">{v.metaDescription || t('pdv.none')}</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Related variants — other variants of the same product. */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          <div>
            <h3>{t('vdv.related')}</h3>
            <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>
              {t('vdv.relatedSub').replace('{name}', p.name)}
            </p>
          </div>
          <span className="chip-tag">{siblings.length}</span>
        </div>
        {siblings.length === 0 ? (
          <div className="hint">{t('vdv.relatedEmpty')}</div>
        ) : (
          <div
            className="variant-related-grid"
            style={{ gridTemplateColumns: `repeat(${relatedCols}, 1fr)` }}
          >
            {relatedItems.map((rv) => (
              <button
                key={rv.id}
                type="button"
                className="vr-card"
                onClick={() => navigate(`/products/${p.id}/variants/${rv.id}`)}
              >
                <div className="vr-av">{rv.name.slice(0, 2).toUpperCase()}</div>
                <div className="vr-body">
                  <div className="vr-name">{rv.name}</div>
                  <div className="vr-meta">
                    {money.format(rv.priceOverride ?? p.sellingPrice)} ·{' '}
                    {t('pvar.stockN').replace('{n}', String(rv.stockQuantity))}
                  </div>
                </div>
                {!rv.isActive ? <span className="vr-tag">{t('prod.inactive')}</span> : null}
              </button>
            ))}
          </div>
        )}
        <Pagination
          page={relatedPage}
          totalPages={relatedTotalPages}
          total={siblings.length}
          limit={RELATED_PAGE_SIZE}
          onPage={setRelatedPage}
          prevLabel={t('common.prev')}
          nextLabel={t('common.next')}
        />
      </div>

      {p.trackInventory ? (
        <MovementHistoryModal
          product={p}
          variantId={v.id}
          title={`${p.name} · ${v.name}`}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      <VariantEditModal
        productId={p.id}
        product={p}
        variant={v}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />

      {canAdjust ? (
        <AdjustStockModal
          product={p}
          variant={{ id: v.id, name: v.name, stock }}
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
        />
      ) : null}

      <ImageCarousel
        images={images.map((g) => ({ url: g.url, altText: g.altText }))}
        index={carousel ?? 0}
        open={carousel !== null}
        onIndexChange={setCarousel}
        onClose={() => setCarousel(null)}
        closeLabel={t('common.close')}
        prevLabel={t('common.prev')}
        nextLabel={t('common.next')}
      />

      <Modal
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title={t('pvar.removeTitle')}
        footer={
          <>
            <Button
              variant="soft"
              onClick={() => setRemoveOpen(false)}
              disabled={removeM.isPending}
            >
              {t('pvar.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={removeM.isPending}
              disabled={reason.trim().length < 3}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => removeM.mutate()}
            >
              {t('pvar.remove')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
          {t('pvar.removeBody').replace('{name}', v.name).replace('{n}', String(stock))}
        </p>
        <label className="lbl2">{t('pvar.reason')}</label>
        <Input
          value={reason}
          placeholder={t('pvar.reasonPh')}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  )
}
