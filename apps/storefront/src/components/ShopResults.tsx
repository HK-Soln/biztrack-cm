'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { PublicProductsQuery } from '@biztrack/types'
import { listProducts } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { ProductCard } from './ProductCard'

const IcLeft = (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m15 6-6 6 6 6" />
  </svg>
)
const IcRight = (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
const IcBox = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M3 8 12 3l9 5v8l-9 5-9-5V8Z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </svg>
)

/** Windowed page list: first, a window around current, last — with gaps as null. */
function pageItems(page: number, total: number): Array<number | null> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const items = new Set([1, total, page, page - 1, page + 1])
  const sorted = [...items].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: Array<number | null> = []
  let prev = 0
  for (const n of sorted) {
    if (n - prev > 1) out.push(null)
    out.push(n)
    prev = n
  }
  return out
}

export function ShopResults({
  slug,
  base,
  query,
}: {
  slug: string
  base: string
  query: PublicProductsQuery
}) {
  const t = useTranslations('shop')
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  const products = data?.data ?? []
  const total = data?.total ?? 0
  const page = query.page ?? 1
  const totalPages = data?.totalPages ?? 1

  const pageHref = (p: number) => {
    const params = new URLSearchParams()
    if (p > 1) params.set('page', String(p))
    if (query.search) params.set('search', query.search)
    if (query.categoryId) params.set('categoryId', query.categoryId)
    const qs = params.toString()
    return `${base}/products${qs ? `?${qs}` : ''}`
  }

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
    <>
      <div className="shop-bar">
        <span className="rc">{t('resultCount', { count: total })}</span>
      </div>

      <div className="p-grid wide">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} slug={slug} base={base} />
        ))}
      </div>

      {totalPages > 1 ? (
        <div className="pager">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} aria-label={t('prev')}>
              {IcLeft}
            </Link>
          ) : (
            <button disabled aria-label={t('prev')}>
              {IcLeft}
            </button>
          )}

          {pageItems(page, totalPages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} style={{ color: 'var(--text-muted)', padding: '0 4px' }}>
                …
              </span>
            ) : n === page ? (
              <button key={n} className="on" aria-current="page">
                {n}
              </button>
            ) : (
              <Link key={n} href={pageHref(n)}>
                {n}
              </Link>
            ),
          )}

          {page < totalPages ? (
            <Link href={pageHref(page + 1)} aria-label={t('next')}>
              {IcRight}
            </Link>
          ) : (
            <button disabled aria-label={t('next')}>
              {IcRight}
            </button>
          )}
        </div>
      ) : null}
    </>
  )
}
