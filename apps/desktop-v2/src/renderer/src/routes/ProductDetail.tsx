import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Modal } from '@biztrack/ui/biztrack'
import type { DataTableColumn } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import type { LocalProduct, LocalVariant } from '@shared/ipc'

const XAF = new Intl.NumberFormat('fr-CM', { maximumFractionDigits: 0 })
const formatXAF = (n: number) => `${XAF.format(n)} FCFA`

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
  const { data: variants = [] } = useQuery({
    queryKey: [...queryKeys.products, 'variants', id],
    queryFn: () => dataClient.products.listVariants(id!),
    enabled: isElectron && !!id,
  })
  const { data: serials = [] } = useQuery({
    queryKey: [...queryKeys.products, 'serials', id],
    queryFn: () => dataClient.products.listSerialUnits(id!),
    enabled: isElectron && !!id && !!product?.isSerialized,
  })

  const [confirmOpen, setConfirmOpen] = useState(false)
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

  const statusPill = () => {
    if (ss === 'out') return <span className="st st-out"><span className="d" />{t('prod.stockOut')}</span>
    if (ss === 'low') return <span className="st st-low"><span className="d" />{t('prod.stockLow')}</span>
    if (ss === 'in') return <span className="st st-ok"><span className="d" />{t('prod.stockIn')}</span>
    return p.isActive ? <span className="st st-brand">{t('prod.active')}</span> : <span className="st st-neutral">{t('prod.inactive')}</span>
  }

  const variantColumns: DataTableColumn<LocalVariant>[] = [
    { key: 'name', header: t('pdv.colVariant'), render: (v) => <span className="nm">{v.name}</span> },
    { key: 'price', header: t('pdv.colPrice'), align: 'right', tdClassName: 'num', render: (v) => formatXAF(v.priceOverride ?? p.sellingPrice) },
    { key: 'cost', header: t('prod.colCost'), align: 'right', tdClassName: 'num', render: (v) => (v.costPriceOverride != null ? formatXAF(v.costPriceOverride) : '—') },
    { key: 'stock', header: t('pdv.colStock'), align: 'right', tdClassName: 'num', render: (v) => (p.isSerialized ? serials.filter((s) => s.variantId === v.id).length : v.stockQuantity) },
    { key: 'status', header: t('prod.colStatus'), render: (v) => (v.isActive ? <span className="st st-ok"><span className="d" />{t('prod.active')}</span> : <span className="st st-neutral">{t('prod.inactive')}</span>) },
  ]

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
          <Button variant="soft" onClick={() => setConfirmOpen(true)} style={{ color: 'var(--danger)' }}>
            {t('pdv.delete')}
          </Button>
          <Button variant="primary" onClick={() => navigate(`/products/${p.id}/edit`)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
              <path d="M14 6l4 4" />
            </svg>
            {t('pdv.edit')}
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
              {p.isFeatured ? <span className="chip-tag">{t('pdv.featured')}</span> : null}
              {p.isPublishedOnline ? <span className="chip-tag">{t('pdv.online')}</span> : null}
              {p.barcode ? <span className="chip-tag">{t('pdv.barcode')} {p.barcode}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="metrics">
        <div className="mc">
          <div className="l">{t('pdv.onHand')}</div>
          <div className={`v${ss === 'low' ? ' warn' : ss === 'out' ? ' bad' : ''}`}>
            {p.trackInventory ? t('pdv.units').replace('{n}', String(p.currentStock)) : '—'}
          </div>
          <div className="s">{threshold > 0 ? t('pdv.threshold').replace('{n}', String(threshold)) : t('pdv.noThreshold')}</div>
        </div>
        <div className="mc">
          <div className="l">{t('pdv.stockValue')}</div>
          <div className="v">{formatXAF(stockValue)}</div>
          <div className="s">{t('pdv.atCost')}</div>
        </div>
        <div className="mc">
          <div className="l">{t('pdv.unitMargin')}</div>
          <div className={`v${marginPct != null ? ' ok' : ''}`}>{marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}</div>
          <div className="s">{unitMargin != null ? t('pdv.perUnit').replace('{v}', formatXAF(unitMargin)) : '—'}</div>
        </div>
        <div className="mc">
          <div className="l">{p.isSerialized ? t('pdv.serialUnits') : variants.length > 0 ? t('pdv.variants') : t('pdv.sellingPrice')}</div>
          <div className="v">{p.isSerialized ? serials.length : variants.length > 0 ? variants.length : formatXAF(p.sellingPrice)}</div>
          <div className="s">{p.unitAbbr ?? ''}</div>
        </div>
      </div>

      <div className="split mb20" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><div><h3>{t('pdv.details')}</h3></div></div>
          <div className="fields-grid">
            <div className="fld"><div className="fl">{t('pdv.sku')}</div><div className="fv">{p.sku || t('pdv.none')}</div></div>
            <div className="fld"><div className="fl">{t('pdv.category')}</div><div className="fv">{p.categoryName || t('pdv.none')}</div></div>
            <div className="fld"><div className="fl">{t('pdv.brand')}</div><div className="fv">{p.brandName || t('pdv.none')}</div></div>
            <div className="fld"><div className="fl">{t('pdv.unit')}</div><div className="fv">{p.unitAbbr || t('pdv.none')}</div></div>
            <div className="fld"><div className="fl">{t('pdv.type')}</div><div className="fv">{t(`prodf.type_${p.productType}` as Parameters<typeof t>[0])}</div></div>
            {p.isSerialized ? (
              <div className="fld"><div className="fl">{t('pdv.warranty')}</div><div className="fv">{p.warrantyMonths != null ? t('pdv.warrantyMonths').replace('{n}', String(p.warrantyMonths)) : t('pdv.none')}</div></div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div><h3>{t('pdv.pricing')}</h3></div></div>
          <div className="kv">
            <div className="row"><span>{t('pdv.sellingPrice')}</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatXAF(p.sellingPrice)}</span></div>
            <div className="row"><span>{t('pdv.cost')}</span><span className="neg">{p.costPrice != null ? `−${formatXAF(p.costPrice)}` : '—'}</span></div>
            <div className="row total"><span>{t('pdv.margin')}</span><span>{unitMargin != null ? formatXAF(unitMargin) : '—'}{marginPct != null ? ` · ${marginPct.toFixed(1)}%` : ''}</span></div>
          </div>
        </div>
      </div>

      {variants.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <DataTable<LocalVariant>
            columns={variantColumns}
            rows={variants}
            rowKey={(v) => v.id}
            title={t('pdv.variants')}
            countLabel={t('prod.count').replace('{n}', String(variants.length))}
          />
        </div>
      ) : null}

      {p.isSerialized ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h"><div><h3>{t('pdv.serials')}</h3></div><span className="chip-tag">{serials.length}</span></div>
          {serials.length === 0 ? (
            <div className="hint">{t('pdv.noSerials')}</div>
          ) : (
            <div className="serials-list">
              {serials.map((s) => (
                <span key={s.id} className="serial-pill">{s.serialNumber}</span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {p.isPublishedOnline ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h"><div><h3>{t('pdv.onlineSeo')}</h3></div></div>
          <div className="fields-grid">
            <div className="fld"><div className="fl">{t('pdv.metaTitle')}</div><div className="fv">{p.metaTitle || p.name}</div></div>
            <div className="fld"><div className="fl">{t('pdv.reserve')}</div><div className="fv">{p.onlineStockReserve}</div></div>
          </div>
          {p.onlineDescription ? <p className="desc" style={{ marginTop: 12 }}>{p.onlineDescription}</p> : null}
          {p.metaDescription ? <p className="hint" style={{ marginTop: 8 }}>{p.metaDescription}</p> : null}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h"><div><h3>{t('pdv.gallery')}</h3></div></div>
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
