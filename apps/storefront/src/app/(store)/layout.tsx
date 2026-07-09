import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getStore } from '@/lib/api'
import { getStoreSlug } from '@/lib/store'
import { storeFaviconUrl } from '@/lib/favicon'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'

const BRANDS = ['a', 'b', 'c', 'd', 'e', 'f']

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getStoreSlug()
  const store = slug ? await getStore(slug) : null
  if (!store) return { title: 'Boutique introuvable' }
  const title = store.seo.title || store.storeName
  const description = store.seo.description || store.tagline || undefined
  const favicon = storeFaviconUrl(store)
  return {
    title,
    description,
    icons: { icon: favicon, shortcut: favicon, apple: favicon },
    openGraph: {
      title,
      description,
      images: store.seo.ogImageUrl ? [store.seo.ogImageUrl] : undefined,
    },
  }
}

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const slug = await getStoreSlug()
  const store = slug ? await getStore(slug) : null
  if (!store) notFound()

  const brand = BRANDS.includes(store.themeId) ? store.themeId : 'a'

  return (
    <div className="store" data-brand={brand} data-theme={store.appearance}>
      <StoreHeader store={store} base="" />
      <main>{children}</main>
      <StoreFooter store={store} base="" />
    </div>
  )
}
