import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { PublicProductsQuery } from '@biztrack/types'
import { getCategories, getFacets, listProducts } from '@/lib/api'
import { getStoreSlug } from '@/lib/store'
import { getQueryClient, queryKeys } from '@/lib/query'
import { ShopBrowser } from '@/components/ShopBrowser'

const IcChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

const parseIds = (v: string | string[] | undefined): string[] | undefined => {
  if (typeof v === 'string') {
    const arr = v.split(',').filter(Boolean)
    return arr.length ? arr : undefined
  }
  if (Array.isArray(v)) return v.length ? v : undefined
  return undefined
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const slug = await getStoreSlug()
  if (!slug) notFound()
  const sp = await searchParams

  const query: PublicProductsQuery = {
    page: sp.page ? Math.max(1, Number(sp.page)) : 1,
    limit: 24,
    search: typeof sp.search === 'string' ? sp.search : undefined,
    categoryIds: parseIds(sp.categoryIds),
    brandIds: parseIds(sp.brandIds),
    modelIds: parseIds(sp.modelIds),
    attributeOptionIds: parseIds(sp.attributeOptionIds),
  }

  const [categoryTree, facets, t, tn] = await Promise.all([
    getCategories(slug),
    getFacets(slug, query.categoryIds),
    getTranslations('shop'),
    getTranslations('nav'),
  ])

  const queryClient = getQueryClient()
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  const categories = (categoryTree?.tree ?? [])
    .filter((c) => c.productCount > 0 && c.showOnline !== false)
    .map((c) => ({ id: c.id, name: c.name }))

  const title = query.search ? t('titleSearch', { query: query.search }) : t('title')

  return (
    <div className="wrap">
      <div className="crumb">
        <Link href="/">{tn('home')}</Link>
        {IcChevron}
        <span className="cur">{t('title')}</span>
      </div>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{t('subtitle')}</p>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ShopBrowser
          slug={slug}
          base=""
          categories={categories}
          facets={facets ?? { brands: [], models: [], attributeGroups: [] }}
          query={query}
        />
      </HydrationBoundary>
    </div>
  )
}
