'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { PublicProductsQuery } from '@biztrack/types'
import { listProducts } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { ProductCard } from './ProductCard'

const IcArrow = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

/** "You may also like" rail — other published products, current one excluded. */
export function RelatedProducts({
  slug,
  base,
  currentId,
  query,
}: {
  slug: string
  base: string
  currentId: string
  query: PublicProductsQuery
}) {
  const t = useTranslations('product')
  const { data } = useQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  const related = (data?.data ?? []).filter((p) => p.id !== currentId).slice(0, 4)
  if (related.length === 0) return null

  return (
    <div className="wrap">
      <section className="sec">
        <div className="sec-head">
          <div>
            <h2>{t('relatedTitle')}</h2>
          </div>
          <Link className="all" href={`${base}/products`}>
            {t('viewAll')} {IcArrow}
          </Link>
        </div>
        <div className="p-grid">
          {related.map((product) => (
            <ProductCard key={product.id} product={product} slug={slug} base={base} />
          ))}
        </div>
      </section>
    </div>
  )
}
