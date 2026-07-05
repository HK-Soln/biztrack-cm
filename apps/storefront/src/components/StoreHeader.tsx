'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { PublicStore } from '@biztrack/types'
import { getCart } from '@/lib/api'
import { useCartSession } from '@/lib/cart-store'
import { LocaleSwitcher } from './LocaleSwitcher'

const IcMenu = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)
const IcSearch = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
const IcCart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M2 3h3l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
  </svg>
)
const IcClose = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

/** The store's cart badge — reads the persisted session token and fetches the live cart. */
function CartCount({ slug }: { slug: string }) {
  const token = useCartSession((s) => s.sessionToken)
  const { data } = useQuery({
    queryKey: ['cart', slug, token],
    queryFn: () => getCart(slug, token as string),
    enabled: !!token,
  })
  const count = (data?.items ?? []).reduce((n, it) => n + it.quantity, 0)
  if (!count) return null
  return <span className="count">{count}</span>
}

export function StoreHeader({ store, base }: { store: PublicStore; base: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const tn = useTranslations('nav')
  const th = useTranslations('header')
  const [menu, setMenu] = useState(false)
  const [q, setQ] = useState('')

  const href = (p: string) => `${base}${p}` || '/'
  const isActive = (p: string) => pathname === href(p)
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const query = q.trim()
    router.push(`${href('/products')}${query ? `?search=${encodeURIComponent(query)}` : ''}`)
  }

  const nav = [
    { p: '', label: tn('home') },
    { p: '/products', label: tn('shop') },
    { p: '/contact', label: tn('contact') },
  ]

  return (
    <>
      <div className="sf-top">
        <div className="wrap">
          {store.fulfilment.offerDelivery ? (
            <span className="tk">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
                <circle cx="7" cy="17" r="1.6" />
                <circle cx="17" cy="17" r="1.6" />
              </svg>
              {store.city ? th('deliveryTo', { city: store.city }) : th('deliveryAvailable')}
            </span>
          ) : null}
          {store.paymentMethods.cashOnDelivery ? (
            <span className="tk">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              {th('payOnDelivery')}
            </span>
          ) : null}
          <span className="sp" />
          <span className="tk">
            {th('needHelp')} <Link href={href('/contact')}>{th('contactUs')}</Link>
          </span>
        </div>
      </div>

      <header className="sf-head">
        <div className="wrap">
          <button
            className="icon-btn burger"
            aria-label={th('menu')}
            type="button"
            onClick={() => setMenu(true)}
          >
            {IcMenu}
          </button>
          <Link className="brand" href={href('')}>
            <div className="mk">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logoUrl} alt={store.storeName} />
              ) : (
                store.storeName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="bt">{store.storeName}</div>
              {store.city ? <div className="bs">{store.city}</div> : null}
            </div>
          </Link>
          <nav className="sf-nav">
            {nav.map((n) => (
              <Link key={n.label} href={href(n.p)} className={isActive(n.p) ? 'on' : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <form className="sf-search" onSubmit={submitSearch}>
            {IcSearch}
            <input
              placeholder={th('searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <div className="sf-actions">
            <LocaleSwitcher />
            <Link className="icon-btn" href={href('/cart')} aria-label={tn('cart')}>
              {IcCart}
              <CartCount slug={store.storeSlug} />
            </Link>
          </div>
        </div>
      </header>

      {/* mobile menu */}
      <div
        className={`mmenu-ov${menu ? ' open' : ''}`}
        onClick={() => setMenu(false)}
        aria-hidden
      />
      <aside className={`mmenu${menu ? ' open' : ''}`}>
        <div className="mm-head">
          <div className="brand">
            <div className="mk">{store.storeName.charAt(0).toUpperCase()}</div>
            <div>
              <div className="bt">{store.storeName}</div>
            </div>
          </div>
          <button
            className="cd-x"
            type="button"
            aria-label={th('close')}
            onClick={() => setMenu(false)}
          >
            {IcClose}
          </button>
        </div>
        <nav className="mm-nav">
          {nav.map((n) => (
            <Link
              key={n.label}
              href={href(n.p)}
              className={isActive(n.p) ? 'on' : undefined}
              onClick={() => setMenu(false)}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mm-foot">
          <LocaleSwitcher />
        </div>
      </aside>
    </>
  )
}
