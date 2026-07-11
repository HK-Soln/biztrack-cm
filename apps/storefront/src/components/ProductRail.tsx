'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { PublicProductsQuery } from '@biztrack/types'
import { listProducts } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { ProductCard } from './ProductCard'

const IcBox = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M3 8 12 3l9 5v8l-9 5-9-5V8Z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </svg>
)

/**
 * A hydrated product grid. The server prefetches `queryKeys.products(slug, query)`
 * so the first paint is SSR; TanStack then owns refetches on the client.
 */
export function ProductRail({
  slug,
  base,
  query,
}: {
  slug: string
  base: string
  query: PublicProductsQuery
}) {
  const t = useTranslations('home')
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  const products = data?.data ?? []

  if (!isLoading && products.length === 0) {
    return (
      <div className="empty">
        <div className="ei">{IcBox}</div>
        <h3>{t('emptyTitle')}</h3>
        <p>{t('emptyDesc')}</p>
      </div>
    )
  }

  return (
    <div className="p-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} slug={slug} base={base} />
      ))}
    </div>
  )
}
