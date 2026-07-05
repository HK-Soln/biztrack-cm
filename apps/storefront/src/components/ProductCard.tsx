'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { PublicProductListItem } from '@biztrack/types'
import { useAddToCart } from '@/lib/use-cart'

const IcPlus = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const IcCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const formatAmount = (value: number) => Math.round(value).toLocaleString('fr-FR')

/** A single product tile — reused across home rails and the shop grid. */
export function ProductCard({
  product,
  slug,
  base,
}: {
  product: PublicProductListItem
  slug: string
  base: string
}) {
  const t = useTranslations('product')
  const add = useAddToCart(slug)
  const [added, setAdded] = useState(false)

  const detailHref = `${base}/products/${product.slug}`
  const soldOut = !product.hasVariants && product.inStock <= 0
  const lowStock = !product.hasVariants && product.inStock > 0 && product.inStock <= 5

  const handleAdd = () => {
    add.mutate(
      { productId: product.id, quantity: 1 },
      {
        onSuccess: () => {
          setAdded(true)
          setTimeout(() => setAdded(false), 1400)
        },
      },
    )
  }

  return (
    <article className={`pcard${soldOut ? ' out' : ''}`}>
      <Link className="pimg" href={detailHref}>
        {product.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.primaryImageUrl} alt={product.name} loading="lazy" />
        ) : (
          <span className="ph">IMG</span>
        )}
      </Link>
      <div className="pbody">
        {product.categoryName ? <div className="pcat">{product.categoryName}</div> : null}
        <Link className="pn" href={detailHref}>
          {product.name}
        </Link>

        {soldOut ? (
          <div className="stockbar">{t('outOfStock')}</div>
        ) : lowStock ? (
          <div className="stockbar">{t('lowStock', { count: product.inStock })}</div>
        ) : null}

        <div className="pfoot">
          <div className="price">
            {product.hasVariants ? <span className="cur">{t('from')} </span> : null}
            {formatAmount(product.sellingPrice)}
            <span className="cur">{product.currency}</span>
          </div>

          {product.hasVariants ? (
            <Link className="add" href={detailHref} aria-label={t('selectOptions')}>
              {IcPlus}
            </Link>
          ) : (
            <button
              type="button"
              className="add"
              onClick={handleAdd}
              disabled={soldOut || add.isPending}
              aria-label={t('addToCart')}
            >
              {added ? IcCheck : IcPlus}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
