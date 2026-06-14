import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { PublicProductsQuery } from '@biztrack/types'
import { listProducts } from '@/lib/api'
import { getQueryClient, queryKeys } from '@/lib/query'
import { ProductListView } from '@/components/ProductListView'

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

  const queryClient = getQueryClient()
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  return (
    <div style={{ paddingTop: 12 }}>
      <h2 className="container" style={{ margin: '12px auto' }}>
        {query.search ? `Results for “${query.search}”` : 'All products'}
      </h2>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProductListView slug={slug} query={query} paginate />
      </HydrationBoundary>
    </div>
  )
}
