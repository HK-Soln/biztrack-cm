import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getStore, listProducts } from '@/lib/api'
import { getQueryClient, queryKeys } from '@/lib/query'
import { ProductListView } from '@/components/ProductListView'

export default async function StoreHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const store = await getStore(slug)
  const query = { page: 1, limit: 12 }

  // Server-prefetch into the query cache → fully SSR first paint + client hydration.
  const queryClient = getQueryClient()
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  return (
    <>
      <section className="store-banner">
        <div className="container">
          <h1 style={{ margin: '0 0 4px' }}>{store?.storeName}</h1>
          {store?.tagline ? <p className="muted" style={{ margin: 0 }}>{store.tagline}</p> : null}
        </div>
      </section>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProductListView slug={slug} query={query} />
      </HydrationBoundary>
    </>
  )
}
