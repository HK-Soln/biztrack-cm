import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { PublicProductsQuery } from '@biztrack/types'
import { getProduct, getStore, listProducts } from '@/lib/api'
import { getStoreSlug } from '@/lib/store'
import { getQueryClient, queryKeys } from '@/lib/query'
import { ProductDetailView } from '@/components/ProductDetailView'
import { RelatedProducts } from '@/components/RelatedProducts'

type PageParams = { params: Promise<{ productSlug: string }> }

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { productSlug } = await params
  const slug = await getStoreSlug()
  const product = slug ? await getProduct(slug, productSlug) : null
  if (!product) return { title: 'Product not found' }
  const title = product.metaTitle ?? product.name
  return {
    title,
    description:
      product.metaDescription ?? product.onlineDescription ?? product.description ?? undefined,
    openGraph: {
      title,
      images: product.images.length > 0 ? [product.images[0] as string] : undefined,
    },
  }
}

export default async function ProductDetailPage({ params }: PageParams) {
  const { productSlug } = await params
  const slug = await getStoreSlug()
  if (!slug) notFound()
  const [product, store] = await Promise.all([getProduct(slug, productSlug), getStore(slug)])
  if (!product) notFound()

  const relatedQuery: PublicProductsQuery = { page: 1, limit: 8 }
  const queryClient = getQueryClient()
  // Seed the detail cache (SSR paint) + prefetch the related rail.
  queryClient.setQueryData(queryKeys.product(slug, productSlug), product)
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products(slug, relatedQuery),
    queryFn: () => listProducts(slug, relatedQuery),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductDetailView slug={slug} productSlug={productSlug} base="" store={store} />
      <RelatedProducts slug={slug} base="" currentId={product.id} query={relatedQuery} />
    </HydrationBoundary>
  )
}
