import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getProduct } from '@/lib/api'
import { getQueryClient, queryKeys } from '@/lib/query'
import { ProductDetailView } from '@/components/ProductDetailView'

type PageParams = { params: Promise<{ slug: string; productSlug: string }> }

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug, productSlug } = await params
  const product = await getProduct(slug, productSlug)
  if (!product) return { title: 'Product not found' }
  return {
    title: product.metaTitle ?? product.name,
    description: product.metaDescription ?? product.onlineDescription ?? product.description ?? undefined,
    openGraph: {
      title: product.metaTitle ?? product.name,
      images: product.images.length > 0 ? [product.images[0] as string] : undefined,
    },
  }
}

export default async function ProductDetailPage({ params }: PageParams) {
  const { slug, productSlug } = await params
  const product = await getProduct(slug, productSlug)
  if (!product) notFound()

  // Seed the query cache so the client view renders the SSR markup immediately.
  const queryClient = getQueryClient()
  queryClient.setQueryData(queryKeys.product(slug, productSlug), product)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductDetailView slug={slug} productSlug={productSlug} />
    </HydrationBoundary>
  )
}
