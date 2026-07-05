import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getStore } from '@/lib/api'
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

  // Subdomain access (akwa.host/…) serves at the URL root, so links carry no slug.
  // Path access (host/akwa/…) needs the /slug prefix. Detect from the Host header.
  const host = (await headers()).get('host')?.split(':')[0] ?? ''
  const base = host.startsWith(`${slug}.`) ? '' : `/${slug}`
  const brand = BRANDS.includes(store.themeId) ? store.themeId : 'a'

  return (
    <div className="store" data-brand={brand} data-theme={store.appearance}>
      <StoreHeader store={store} base={base} />
      <main>{children}</main>
      <StoreFooter store={store} base={base} />
    </div>
  )
}
