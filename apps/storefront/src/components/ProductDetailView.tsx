'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import type { PublicStore } from '@biztrack/types'
import { getProduct } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { useAddToCart } from '@/lib/use-cart'

const formatAmount = (value: number) => Math.round(value).toLocaleString('fr-FR')

const IcChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
const IcCart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M2 3h3l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
  </svg>
)
const IcCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)
const IcTruck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
    <circle cx="7" cy="17" r="1.6" />
    <circle cx="17" cy="17" r="1.6" />
  </svg>
)
const IcStore = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 9h16l-1-4H5L4 9Z" />
    <path d="M5 9v10h14V9M9 19v-5h6v5" />
  </svg>
)
const IcWallet = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M16 14h2" />
  </svg>
)
const IcShield = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

export function ProductDetailView({
  slug,
  productSlug,
  base,
  store,
}: {
  slug: string
  productSlug: string
  base: string
  store: PublicStore | null
}) {
  const t = useTranslations('product')
  const ts = useTranslations('shop')
  const add = useAddToCart(slug)
  const [variantId, setVariantId] = useState<string | undefined>(undefined)
  const [imgIndex, setImgIndex] = useState(0)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const { data: product } = useQuery({
    queryKey: queryKeys.product(slug, productSlug),
    queryFn: () => getProduct(slug, productSlug),
  })
  if (!product) return null

  const href = (p: string) => `${base}${p}` || '/'
  const hasVariants = product.hasVariants && product.variants.length > 0
  const tracked = product.trackInventory
  // Auto-select the first available variant so the buyer never has to "choose options"
  // before adding — the selected variant is what goes in the cart.
  const firstAvailable =
    product.variants.find((v) => !tracked || v.inStock > 0) ?? product.variants[0]
  const selectedId = variantId ?? (hasVariants ? firstAvailable?.id : undefined)
  const selected = product.variants.find((v) => v.id === selectedId)
  const price = selected?.sellingPrice ?? product.sellingPrice
  // Out-of-stock only blocks a tracked SIMPLE product. Variant products stay addable
  // (staff assign serial units / confirm stock at order confirmation).
  const soldOut = !hasVariants && tracked && product.inStock <= 0
  const canAdd = hasVariants ? true : !soldOut
  const maxQty = !hasVariants && tracked && product.inStock > 0 ? product.inStock : Infinity

  const images = product.images ?? []
  const mainImg = images[imgIndex]
  const description = product.onlineDescription ?? product.description ?? null

  const handleAdd = () => {
    if (!canAdd) return
    add.mutate(
      { productId: product.id, variantId: hasVariants ? selectedId : undefined, quantity: qty },
      {
        onSuccess: () => {
          setAdded(true)
          setTimeout(() => setAdded(false), 1600)
        },
      },
    )
  }

  const feat: Array<{ icon: React.ReactNode; title: string; desc: string }> = []
  if (store?.fulfilment.offerDelivery) {
    feat.push({
      icon: IcTruck,
      title: t('featDeliveryTitle', { city: store.city ? ` ${store.city}` : '' }),
      desc: t('featDeliveryDesc'),
    })
  }
  if (store?.fulfilment.offerPickup) {
    feat.push({ icon: IcStore, title: t('featPickupTitle'), desc: t('featPickupDesc') })
  }
  if (store?.paymentMethods.cashOnDelivery) {
    feat.push({ icon: IcWallet, title: t('featPaymentTitle'), desc: t('featPaymentDesc') })
  }
  feat.push({ icon: IcShield, title: t('featAuthenticTitle'), desc: t('featAuthenticDesc') })

  const addLabel = added ? t('added') : soldOut ? t('outOfStock') : t('addToCart')

  return (
    <div className="wrap">
      <div className="crumb">
        <Link href={href('')}>{ts('breadcrumbHome')}</Link>
        {IcChevron}
        <Link href={href('/products')}>{ts('title')}</Link>
        {IcChevron}
        <span className="cur">{product.name}</span>
      </div>

      <div className="pd">
        {/* gallery */}
        <div className="pd-gallery">
          <div className="pd-main">
            {mainImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImg} alt={product.name} />
            ) : (
              <span className="ph">{product.name}</span>
            )}
          </div>
          {images.length > 1 ? (
            <div className="pd-thumbs">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  className={`pd-thumb${i === imgIndex ? ' on' : ''}`}
                  onClick={() => setImgIndex(i)}
                  aria-label={`${product.name} ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* info */}
        <div className="pd-info">
          {product.categoryName ? <span className="eyebrow">{product.categoryName}</span> : null}
          <h1>{product.name}</h1>

          <div className="pd-meta">
            {soldOut ? (
              <span style={{ color: 'var(--danger)', fontWeight: 650 }}>● {t('outOfStock')}</span>
            ) : (
              <span style={{ color: 'var(--success)', fontWeight: 650 }}>● {t('inStock')}</span>
            )}
          </div>

          <div className="pd-price">
            {hasVariants && !selected ? <span className="cur">{t('from')} </span> : null}
            <span className="now">{formatAmount(price)}</span>
            <span className="cur">{product.currency}</span>
          </div>

          {description ? <p className="pd-desc">{description}</p> : null}

          {hasVariants ? (
            <>
              <div className="opt-label">{t('options')}</div>
              <div className="opt-row">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`opt${v.id === selectedId ? ' on' : ''}`}
                    onClick={() => {
                      setVariantId(v.id)
                      setQty(1)
                    }}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="opt-label">{t('quantity')}</div>
          <div className="buy-row">
            <div className="stepper">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
              >
                −
              </button>
              <span className="q">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={!canAdd || qty >= maxQty}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              disabled={!canAdd || add.isPending}
              onClick={handleAdd}
            >
              {added ? IcCheck : IcCart}
              {addLabel}
            </button>
          </div>
          {add.isError ? (
            <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: 13 }}>
              {(add.error as Error).message}
            </p>
          ) : null}

          {feat.length ? (
            <div className="pd-feat">
              {feat.map((f) => (
                <div className="f" key={f.title}>
                  {f.icon}
                  <div>
                    <div className="t">{f.title}</div>
                    <div className="d">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
