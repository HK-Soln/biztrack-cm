import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { MARKETING_URL } from '@/lib/host'
import { getCurrentStore } from '@/lib/store'
import { storeFaviconUrl } from '@/lib/favicon'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'

const BRANDS = ['a', 'b', 'c', 'd', 'e', 'f']

export async function generateMetadata(): Promise<Metadata> {
  // Never throw from metadata — the layout owns the redirect-vs-error decision, and the cached
  // promise re-throws there anyway. Metadata for a page nobody sees is not worth failing over.
  const store = await getCurrentStore().catch(() => null)
  if (!store) return {}
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
  // No shop on this host, or no shop by that name -> the marketing site. `getStore` throws rather
  // than returning null when the API is unreachable, so an outage surfaces as an error page
  // instead of silently redirecting customers away from a shop that exists.
  const store = await getCurrentStore()
  if (!store) redirect(MARKETING_URL)

  const brand = BRANDS.includes(store.themeId) ? store.themeId : 'a'

  return (
    <div className="store" data-brand={brand} data-theme={store.appearance}>
      <StoreHeader store={store} base="" />
      <main>{children}</main>
      <StoreFooter store={store} base="" />
    </div>
  )
}
