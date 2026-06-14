import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getStore } from '@/lib/api'

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

  return (
    <>
      <header className="store-header">
        <div className="store-header__inner">
          <Link href={`/${slug}`} className="store-header__name" style={{ color: store.primaryColor }}>
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logoUrl} alt={store.storeName} height={28} />
            ) : (
              store.storeName
            )}
          </Link>
          <nav style={{ display: 'flex', gap: 16, fontSize: 14 }}>
            <Link href={`/${slug}/products`}>Products</Link>
            {store.whatsappNumber ? (
              <a
                href={`https://wa.me/${store.whatsappNumber.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                Chat
              </a>
            ) : null}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="store-footer">
        {store.storeName}
        {store.city ? ` · ${store.city}` : ''}
        {store.phone ? ` · ${store.phone}` : ''}
        <div style={{ marginTop: 6 }}>Powered by BizTrack CM</div>
      </footer>
    </>
  )
}
