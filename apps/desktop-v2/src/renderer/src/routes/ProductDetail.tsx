import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { ManageSerialUnits } from '@/components/products/ManageSerialUnits'
import { ManageVariants } from '@/components/products/ManageVariants'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import type { LocalProduct, StockMovementType } from '@shared/ipc'

const MV_DATE = new Intl.DateTimeFormat('fr-CM', { day: 'numeric', month: 'short' })
const MV_TIME = new Intl.DateTimeFormat('fr-CM', { hour: '2-digit', minute: '2-digit' })
const formatMovementDate = (iso: string): string => {
  const d = new Date(iso)
  return `${MV_DATE.format(d)} · ${MV_TIME.format(d)}`
}

/** Stock-movement type → ledger pill colour (mirrors the design .et-* palette). */
const MV_PILL: Record<StockMovementType, string> = {
  OPENING_STOCK: 'et-sale',
  RESTOCK_IN: 'et-pay',
  TRANSFER_IN: 'et-pay',
  VOID_REVERSAL: 'et-pay',
  SALE: 'et-debt',
  TRANSFER_OUT: 'et-debt',
  MANUAL_ADJUSTMENT: 'et-woff',
}

function stockState(p: LocalProduct): 'in' | 'low' | 'out' | 'none' {
  if (!p.trackInventory) return 'none'
  const threshold = p.reorderPoint ?? p.lowStockThreshold ?? 0
  if (p.currentStock <= 0) return 'out'
  if (threshold > 0 && p.currentStock <= threshold) return 'low'
  return 'in'
}

export function ProductDetail() {
  const t = useT()
  const navigate = useNavigate()
  const { id } = useParams()
  const qc = useQueryClient()
  const money = useCurrency()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: product, isPending } = useQuery({
    queryKey: [...queryKeys.products, 'one', id],
    queryFn: () => dataClient.products.get(id!),
    enabled: isElectron && !!id,
  })
  const { data: images = [] } = useQuery({
    queryKey: [...queryKeys.products, 'images', id],
    queryFn: () => dataClient.products.listImages(id!),
    enabled: isElectron && !!id,
  })
  const { data: movements = [] } = useQuery({
    queryKey: [...queryKeys.products, 'movements', id],
    queryFn: () => dataClient.products.listMovements(id!),
    enabled: isElectron && !!id && !!product?.trackInventory,
  })

  const removeM = useMutation({
    mutationFn: () => dataClient.products.remove(id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.products })
      navigate('/products')
    },
  })

  if (isPending) return <div className="frame"><div className="cat-empty">{t('pdv.loading')}</div></div>
  if (!product) return <div className="frame"><div className="cat-empty">{t('pdv.notFound')}</div></div>

  const p = product
  const threshold = p.reorderPoint ?? p.lowStockThreshold ?? 0
  const ss = stockState(p)
  const stockValue = (p.costPrice ?? 0) * p.currentStock
  const unitMargin = p.costPrice != null && p.costPrice > 0 && p.sellingPrice > 0 ? p.sellingPrice - p.costPrice : null
  const marginPct = unitMargin != null && p.sellingPrice > 0 ? (unitMargin / p.sellingPrice) * 100 : null
  const onHandClass = ss === 'low' ? ' warn' : ss === 'out' ? ' bad' : ''

  const statusPill = () => {
    if (ss === 'out') return <span className="st st-out"><span className="d" />{t('prod.stockOut')}</span>
    if (ss === 'low') return <span className="st st-low"><span className="d" />{t('prod.stockLow')}</span>
    if (ss === 'in') return <span className="st st-ok"><span className="d" />{t('prod.stockIn')}</span>
    return p.isActive ? <span className="st st-brand">{t('prod.active')}</span> : <span className="st st-neutral">{t('prod.inactive')}</span>
  }

  return (
    <div className="frame">
      <div className="detail-top">
        <button type="button" className="back-btn" onClick={() => navigate('/products')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 3-5 5 5 5" />
            <path d="M2 8h12" />
          </svg>
          {t('pdv.back')}
        </button>
        <div className="acts2">
          {/* Restock / Adjust stock are part of the Inventory module (not built yet) — disabled + flagged. */}
          <Button variant="default" disabled title={t('pdv.inventorySoon')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
            {t('pdv.restock')}
          </Button>
          <Button variant="default" disabled title={t('pdv.inventorySoon')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 20h9M3 20l4-1L18 8l-3-3L4 16l-1 4Z" /></svg>
            {t('pdv.adjustStock')}
          </Button>
          <Button variant="primary" onClick={() => navigate(`/products/${p.id}/edit`)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M14 6l4 4" /></svg>
            {t('pdv.edit')}
          </Button>
          <Button variant="soft" onClick={() => setConfirmOpen(true)} style={{ color: 'var(--danger)' }} title={t('pdv.delete')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
            {t('pdv.delete')}
          </Button>
        </div>
      </div>

      <div className="dhero">
        <div className="dhero-in">
          <div className="av">{p.imageUrl ? <img src={p.imageUrl} alt="" /> : p.name.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{t('prod.title')}{p.categoryName ? ` / ${p.categoryName}` : ''}</div>
            <h1>{p.name}</h1>
            {p.description ? <p className="desc">{p.description}</p> : null}
            <div className="badges">
              {statusPill()}
              {p.taxRate > 0 ? <span className="chip-tag">{t('pdv.taxable')}</span> : null}
              {p.isSerialized ? <span className="chip-tag">{t('pdv.serialized')}</span> : p.trackInventory ? <span className="chip-tag">{t('pdv.tracked')}</span> : null}
              {p.barcode ? <span className="chip-tag">{t('pdv.barcode')} {p.barcode}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="metrics">
        <div className="mc">
          <div className="l">{t('pdv.onHand')}</div>
          <div className={`v${onHandClass}`}>{p.trackInventory ? t('pdv.units').replace('{n}', String(p.currentStock)) : '—'}</div>
          <div className="s">{threshold > 0 ? t('pdv.threshold').replace('{n}', String(threshold)) : t('pdv.noThreshold')}</div>
        </div>
        <div className="mc">
          <div className="l">{t('pdv.stockValue')}</div>
          <div className="v">{money.format(stockValue)}</div>
          <div className="s">{t('pdv.atCost')}</div>
        </div>
        <div className="mc">
          <div className="l">{t('pdv.unitMargin')}</div>
          <div className={`v${marginPct != null ? ' ok' : ''}`}>{marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}</div>
          <div className="s">{unitMargin != null ? t('pdv.perUnit').replace('{v}', money.format(unitMargin)) : '—'}</div>
        </div>
        {/* Sold/30d needs the Sales module — shown per design but flagged until then. */}
        <div className="mc">
          <div className="l">{t('pdv.sold30')}</div>
          <div className="v">—</div>
          <div className="s">{t('pdv.needsSales')}</div>
        </div>
      </div>

      <div className="split mb20">
        {/* Stock bin + movement history (design left column). */}
        <div className="panel">
          <div className="binhead">
            <div className="t">
              {t('pdv.stockOnHand')}
              <p>{t('pdv.binSub')}</p>
            </div>
            <div className="big">
              {p.trackInventory ? p.currentStock : '—'}
              <small>{threshold > 0 ? t('pdv.unitsReorder').replace('{n}', String(threshold)) : t('pdv.unitsOnly')}</small>
            </div>
          </div>
          <div className="binmeta">
            <div className="c"><div className="l">{t('pdv.reorderPt')}</div><div className="v">{threshold > 0 ? threshold : '—'}</div></div>
            {/* Incoming / Reserved / Avg per day require Inventory + Sales — flagged. */}
            <div className="c"><div className="l">{t('pdv.incoming')}</div><div className="v">—</div></div>
            <div className="c"><div className="l">{t('pdv.reserved')}</div><div className="v">—</div></div>
            <div className="c"><div className="l">{t('pdv.avgDay')}</div><div className="v">—</div></div>
          </div>
          {!p.trackInventory ? (
            <div className="bin-empty">{t('pdv.noTracking')}</div>
          ) : movements.length === 0 ? (
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
                        <td><span className={`et ${MV_PILL[m.type] ?? 'et-sale'}`}>{t(`pdv.mv_${m.type}` as Parameters<typeof t>[0])}</span></td>
                        <td>{m.type === 'OPENING_STOCK' ? t('pdv.mvInitial') : m.notes || t('pdv.none')}</td>
                        <td className={`right ${positive ? 't-credit' : 't-debit'}`}>{positive ? '+' : '−'}{Math.abs(m.quantityChange)}</td>
                        <td className="right t-bal">{m.quantityAfter}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="panel-foot">
                <span>{t('pdv.mvShowing').replace('{n}', String(movements.length))}</span>
                <div className="spacer" />
                {/* Full history view arrives with the Inventory module — flagged. */}
                <span className="link" aria-disabled="true" title={t('pdv.inventorySoon')}>{t('pdv.mvViewAll')}</span>
              </div>
            </>
          )}
        </div>

        {/* Details + pricing (design right column). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-h"><div><h3>{t('pdv.details')}</h3></div></div>
            <div className="fields-grid">
              <div className="fld"><div className="fl">{t('pdv.sku')}</div><div className="fv">{p.sku || t('pdv.none')}</div></div>
              <div className="fld"><div className="fl">{t('pdv.category')}</div><div className="fv">{p.categoryName || t('pdv.none')}</div></div>
              <div className="fld"><div className="fl">{t('pdv.unit')}</div><div className="fv">{p.unitAbbr || t('pdv.none')}</div></div>
              {/* Supplier isn't on the product yet (comes with suppliers/restock) — flagged. */}
              <div className="fld"><div className="fl">{t('pdv.supplier')}</div><div className="fv">{t('pdv.none')}</div></div>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><div><h3>{t('pdv.pricing')}</h3></div></div>
            <div className="kv">
              <div className="row"><span>{t('pdv.sellingPrice')}</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{money.format(p.sellingPrice)}</span></div>
              <div className="row"><span>{t('pdv.cost')}</span><span className="neg">{p.costPrice != null ? `−${money.format(p.costPrice)}` : '—'}</span></div>
              <div className="row total"><span>{t('pdv.margin')}</span><span>{unitMargin != null ? money.format(unitMargin) : '—'}</span></div>
            </div>
            {marginPct != null ? (
              <div style={{ marginTop: 14 }}>
                <div className="pay-top" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
                  <span>{t('pdv.marginLabel')}</span>
                  <span>{marginPct.toFixed(1)}%</span>
                </div>
                <div className="mbar" style={{ marginTop: 6 }}>
                  <div className="mbar-fill" style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Variant management (movement-based): add / edit info / remove. */}
      {p.productType === 'SIMPLE' ? <ManageVariants product={p} /> : null}

      {/* Serial units management (movement-based): add / retire / correct. */}
      {p.isSerialized ? <ManageSerialUnits product={p} /> : null}

      {/* Extra: online store & SEO (not in the base design, added per request). */}
      {p.isPublishedOnline ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h"><div><h3>{t('pdv.onlineSeo')}</h3></div><span className="st st-ok"><span className="d" />{t('pdv.online')}</span></div>
          <div className="fields-grid">
            <div className="fld"><div className="fl">{t('pdv.metaTitle')}</div><div className="fv">{p.metaTitle || p.name}</div></div>
            <div className="fld"><div className="fl">{t('pdv.reserve')}</div><div className="fv">{p.onlineStockReserve}</div></div>
            {p.onlineDescription ? <div className="fld full"><div className="fl">{t('prodf.onlineDesc')}</div><div className="fv" style={{ fontWeight: 400, color: 'var(--text-2)' }}>{p.onlineDescription}</div></div> : null}
            {p.metaDescription ? <div className="fld full"><div className="fl">{t('prodf.metaDescription')}</div><div className="fv" style={{ fontWeight: 400, color: 'var(--text-2)' }}>{p.metaDescription}</div></div> : null}
          </div>
        </div>
      ) : null}

      {/* Extra: gallery (not in the base design, added per request). */}
      {images.length > 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h"><div><h3>{t('pdv.gallery')}</h3></div><span className="chip-tag">{images.length}</span></div>
          <div className="detail-gallery">
            {images.map((g) => (
              <img key={g.id} src={g.url} alt="" />
            ))}
          </div>
        </div>
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('prod.deleteTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setConfirmOpen(false)} disabled={removeM.isPending}>
              {t('prod.cancel')}
            </Button>
            <Button variant="primary" loading={removeM.isPending} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => removeM.mutate()}>
              {t('prod.delete')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('prod.deleteBody').replace('{name}', p.name)}
        </p>
      </Modal>
    </div>
  )
}
