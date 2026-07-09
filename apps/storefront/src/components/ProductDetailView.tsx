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
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
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
  const variantAvailable = (v: (typeof product.variants)[number] | undefined) =>
    !!v && (!tracked || v.inStock > 0)
  const attrOf = (v: (typeof product.variants)[number], group: string) =>
    v.attributes.find((a) => a.groupName === group)?.optionValue

  // The buyer picks OPTIONS (Size, Colour, …) — derived from the variants' attributes —
  // and we resolve which variant that combination is (and whether it's available).
  const optionGroups: Array<{
    name: string
    options: Array<{ value: string; colorHex?: string | null }>
  }> = []
  if (hasVariants) {
    for (const v of product.variants) {
      for (const attr of v.attributes) {
        let group = optionGroups.find((g) => g.name === attr.groupName)
        if (!group) {
          group = { name: attr.groupName, options: [] }
          optionGroups.push(group)
        }
        if (!group.options.some((o) => o.value === attr.optionValue)) {
          group.options.push({ value: attr.optionValue, colorHex: attr.colorHex })
        }
      }
    }
  }
  const hasOptions = optionGroups.length > 0

  // Default selection = the first available variant's options (as before).
  const firstAvailable = product.variants.find(variantAvailable) ?? product.variants[0]
  const defaults: Record<string, string> = {}
  if (firstAvailable)
    for (const a of firstAvailable.attributes) defaults[a.groupName] = a.optionValue
  const chosen: Record<string, string> = {}
  for (const g of optionGroups) chosen[g.name] = selectedOptions[g.name] ?? defaults[g.name] ?? ''

  // Resolve the variant from the chosen options (or the picked/first one in name-fallback mode).
  const matched = hasOptions
    ? product.variants.find((v) => optionGroups.every((g) => attrOf(v, g.name) === chosen[g.name]))
    : (product.variants.find((v) => v.id === (variantId ?? firstAvailable?.id)) ?? firstAvailable)

  const price = matched?.sellingPrice ?? product.sellingPrice
  const soldOut = !hasVariants && tracked && product.inStock <= 0
  // For variants: unavailable = no such combination, or the matched variant is out of stock.
  const variantSoldOut = hasVariants ? !matched || !variantAvailable(matched) : false
  const canAdd = hasVariants ? Boolean(matched) && variantAvailable(matched) : !soldOut
  const maxQty = hasVariants
    ? tracked && matched && matched.inStock > 0
      ? matched.inStock
      : Infinity
    : tracked && product.inStock > 0
      ? product.inStock
      : Infinity

  const images = product.images ?? []
  const mainImg = images[imgIndex]
  const description = product.onlineDescription ?? product.description ?? null

  const handleAdd = () => {
    if (!canAdd) return
    add.mutate(
      { productId: product.id, variantId: hasVariants ? matched?.id : undefined, quantity: qty },
      {
        onSuccess: () => {
          setAdded(true)
          setTimeout(() => setAdded(false), 1600)
        },
      },
    )
  }

  // An option is "available" if some in-stock variant has it alongside the OTHER chosen
  // options. The currently-selected option is always shown as available.
  const optionEnabled = (groupName: string, value: string) =>
    product.variants.some(
      (v) =>
        attrOf(v, groupName) === value &&
        optionGroups.every((g) => g.name === groupName || attrOf(v, g.name) === chosen[g.name]) &&
        variantAvailable(v),
    )

  // Pick an option; if it doesn't combine with the current selection, snap the other groups
  // to an available variant that has it (prevents dead-ends).
  const chooseOption = (groupName: string, value: string) => {
    setQty(1)
    const tentative = { ...chosen, [groupName]: value }
    const exact = product.variants.find((v) =>
      optionGroups.every((g) => attrOf(v, g.name) === tentative[g.name]),
    )
    if (exact) {
      setSelectedOptions(tentative)
      return
    }
    const candidate =
      product.variants.find((v) => attrOf(v, groupName) === value && variantAvailable(v)) ??
      product.variants.find((v) => attrOf(v, groupName) === value)
    if (candidate) {
      const next: Record<string, string> = {}
      for (const a of candidate.attributes) next[a.groupName] = a.optionValue
      setSelectedOptions(next)
    } else {
      setSelectedOptions(tentative)
    }
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

  const addLabel = added
    ? t('added')
    : hasVariants
      ? !matched
        ? t('unavailable')
        : !variantAvailable(matched)
          ? t('outOfStock')
          : t('addToCart')
      : soldOut
        ? t('outOfStock')
        : t('addToCart')

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
            {(hasVariants ? variantSoldOut : soldOut) ? (
              <span style={{ color: 'var(--danger)', fontWeight: 650 }}>● {t('outOfStock')}</span>
            ) : (
              <span style={{ color: 'var(--success)', fontWeight: 650 }}>● {t('inStock')}</span>
            )}
          </div>

          <div className="pd-price">
            <span className="now">{formatAmount(price)}</span>
            <span className="cur">{product.currency}</span>
          </div>

          {description ? <p className="pd-desc">{description}</p> : null}

          {hasVariants && hasOptions ? (
            optionGroups.map((group) => (
              <div key={group.name}>
                <div className="opt-label">{group.name}</div>
                <div className="opt-row">
                  {group.options.map((o) => {
                    const isSel = chosen[group.name] === o.value
                    const greyed = !isSel && !optionEnabled(group.name, o.value)
                    return (
                      <button
                        key={o.value}
                        type="button"
                        className={`opt${isSel ? ' on' : ''}`}
                        style={
                          greyed ? { opacity: 0.4, textDecoration: 'line-through' } : undefined
                        }
                        onClick={() => chooseOption(group.name, o.value)}
                      >
                        {o.colorHex ? (
                          <span
                            style={{
                              display: 'inline-block',
                              width: 13,
                              height: 13,
                              borderRadius: 3,
                              background: o.colorHex,
                              marginRight: 7,
                              verticalAlign: 'middle',
                              border: '1px solid rgba(0,0,0,.18)',
                            }}
                          />
                        ) : null}
                        {o.value}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          ) : hasVariants ? (
            <>
              <div className="opt-label">{t('options')}</div>
              <div className="opt-row">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`opt${v.id === matched?.id ? ' on' : ''}`}
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
