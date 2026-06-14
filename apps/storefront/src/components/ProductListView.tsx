'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { PublicProductsQuery } from '@biztrack/types'
import { formatMoney, listProducts } from '@/lib/api'
import { queryKeys } from '@/lib/query'

export function ProductListView({
  slug,
  query,
  paginate = false,
}: {
  slug: string
  query: PublicProductsQuery
  paginate?: boolean
}) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  if (isLoading && !data) {
    return <p className="container muted" style={{ padding: '24px 16px' }}>Loading…</p>
  }

  const products = data?.data ?? []
  if (products.length === 0) {
    return <p className="container muted" style={{ padding: '24px 16px' }}>No products found.</p>
  }

  const page = query.page ?? 1
  const totalPages = data?.totalPages ?? 1
  const pageHref = (p: number) => {
    const params = new URLSearchParams()
    if (p > 1) params.set('page', String(p))
    if (query.search) params.set('search', query.search)
    if (query.categoryId) params.set('categoryId', query.categoryId)
    const qs = params.toString()
    return `/${slug}/products${qs ? `?${qs}` : ''}`
  }

  return (
    <>
      <div className="product-grid container">
        {products.map((product) => (
          <Link key={product.id} href={`/${slug}/products/${product.slug}`} className="product-card">
            <div className="product-card__media">
              {product.primaryImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.primaryImageUrl} alt={product.name} />
              ) : (
                <span>{product.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="product-card__body">
              <div className="product-card__name">{product.name}</div>
              <div className="product-card__price">
                {formatMoney(product.sellingPrice, product.currency)}
              </div>
              {!product.hasVariants && product.inStock <= 0 ? (
                <span className="badge-out" style={{ marginTop: 6 }}>Out of stock</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      {paginate && totalPages > 1 ? (
        <nav className="pagination">
          {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : null}
          <span aria-current="page">
            {page} / {totalPages}
          </span>
          {page < totalPages ? <Link href={pageHref(page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
    </>
  )
}
