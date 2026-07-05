import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CategoryTreeNode, PublicProductsQuery } from '@biztrack/types'
import { getCategories, listProducts } from '@/lib/api'
import { resolveBase } from '@/lib/base'
import { getQueryClient, queryKeys } from '@/lib/query'
import { ShopResults } from '@/components/ShopResults'

const IcChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const sp = await searchParams
  const query: PublicProductsQuery = {
    page: sp.page ? Math.max(1, Number(sp.page)) : 1,
    limit: 24,
    search: typeof sp.search === 'string' ? sp.search : undefined,
    categoryId: typeof sp.categoryId === 'string' ? sp.categoryId : undefined,
  }

  const [categoryTree, base, t] = await Promise.all([
    getCategories(slug),
    resolveBase(slug),
    getTranslations('shop'),
  ])

  const queryClient = getQueryClient()
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  const href = (p: string) => `${base}${p}` || '/'
  const categories: CategoryTreeNode[] = (categoryTree?.tree ?? []).filter(
    (c) => c.productCount > 0 && c.showOnline !== false,
  )
  const activeCategory = categories.find((c) => c.id === query.categoryId)

  const title = query.search
    ? t('titleSearch', { query: query.search })
    : (activeCategory?.name ?? t('title'))

  const catHref = (id?: string) => href(`/products${id ? `?categoryId=${id}` : ''}`)
  const isAll = !query.categoryId

  return (
    <div className="wrap">
      <div className="crumb">
        <Link href={href('')}>{t('breadcrumbHome')}</Link>
        {IcChevron}
        {activeCategory ? (
          <>
            <Link href={href('/products')}>{t('title')}</Link>
            {IcChevron}
            <span className="cur">{activeCategory.name}</span>
          </>
        ) : (
          <span className="cur">{t('title')}</span>
        )}
      </div>

      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{t('subtitle')}</p>

      <div className="shop">
        {/* filters */}
        <aside className="filters">
          {categories.length ? (
            <div className="fgroup">
              <h4>{t('categories')}</h4>
              <Link
                className="fopt"
                href={catHref()}
                style={isAll ? { color: 'var(--brand)', fontWeight: 700 } : undefined}
              >
                {t('all')}
              </Link>
              {categories.map((cat) => {
                const active = cat.id === query.categoryId
                return (
                  <Link
                    key={cat.id}
                    className="fopt"
                    href={catHref(cat.id)}
                    style={active ? { color: 'var(--brand)', fontWeight: 700 } : undefined}
                  >
                    {cat.name}
                    <span className="ct">{cat.productCount}</span>
                  </Link>
                )
              })}
            </div>
          ) : null}
        </aside>

        {/* results */}
        <div>
          {categories.length ? (
            <div className="chipbar">
              <Link className={`fchip${isAll ? ' on' : ''}`} href={catHref()}>
                {t('all')}
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  className={`fchip${cat.id === query.categoryId ? ' on' : ''}`}
                  href={catHref(cat.id)}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          ) : null}

          <HydrationBoundary state={dehydrate(queryClient)}>
            <ShopResults slug={slug} base={base} query={query} />
          </HydrationBoundary>
        </div>
      </div>
    </div>
  )
}
