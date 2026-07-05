import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getStore } from '@/lib/api'
import { resolveBase } from '@/lib/base'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'

const BRANDS = ['a', 'b', 'c', 'd', 'e', 'f']

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const store = await getStore(slug)
  if (!store) return { title: 'Boutique introuvable' }
  const title = store.seo.title || store.storeName
  const description = store.seo.description || store.tagline || undefined
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: store.seo.ogImageUrl ? [store.seo.ogImageUrl] : undefined,
    },
  }
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const store = await getStore(slug)
  if (!store) notFound()

  const base = await resolveBase(slug)
  const brand = BRANDS.includes(store.themeId) ? store.themeId : 'a'

  return (
    <div className="store" data-brand={brand} data-theme={store.appearance}>
      <StoreHeader store={store} base={base} />
      <main>{children}</main>
      <StoreFooter store={store} base={base} />
    </div>
  )
}
