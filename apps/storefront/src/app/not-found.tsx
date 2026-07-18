import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getCategories } from '@/lib/api'
import { getCurrentStore, getStoreSlug } from '@/lib/store'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'
import { StoreNotFoundSearch } from '@/components/StoreNotFoundSearch'

// Host-aware: the chrome and the category chips belong to whichever store the Host names.
export const dynamic = 'force-dynamic'

const BRANDS = ['a', 'b', 'c', 'd', 'e', 'f']

const IcCart = (
  <svg className="cart-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M2 3h3l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
  </svg>
)
const IcHome = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M3 11l9-8 9 8M5 10v10h14V10" />
  </svg>
)

/**
 * The storefront's 404 — for unmatched URLs and for any `notFound()` a page throws.
 *
 * It renders the store chrome ITSELF rather than inheriting it from the (store) layout, which
 * looks redundant but is not: Next ignores a `not-found` file inside a route group and always
 * resolves to this root one, so a `(store)/not-found.tsx` never runs and this page renders
 * outside the (store) layout (vercel/next.js#54980, #55717). Verified against a production
 * build — the route-group version, and the catch-all trick suggested for it, both render Next's
 * built-in "This page could not be found" instead.
 *
 * The `.store` wrapper is load-bearing: every design token is scoped under it.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound')
  // Never throw from the 404 itself — a broken API must not turn a 404 into an error loop.
  const store = await getCurrentStore().catch(() => null)
  const slug = await getStoreSlug()
  const tree = store && slug ? await getCategories(slug) : null
  const chips = (tree?.tree ?? []).filter((c) => c.isActive && c.showOnline !== false).slice(0, 5)

  const brand = store && BRANDS.includes(store.themeId) ? store.themeId : 'a'

  const body = (
    <div className="wrap">
      <div className="err">
        <div className="err-in">
          <div className="err-code">
            4<span className="zero">0{IcCart}</span>4
          </div>
          <h1>{t('title')}</h1>
          <p>{t('body')}</p>

          {store ? <StoreNotFoundSearch /> : null}

          <div className="err-acts">
            <Link className="btn btn-primary btn-lg" href="/">
              {IcHome}
              {t('home')}
            </Link>
            {store ? (
              <Link className="btn btn-lg" href="/products">
                {t('shop')}
              </Link>
            ) : null}
          </div>

          {chips.length ? (
            <div className="err-links">
              <div className="lbl">{t('popular')}</div>
              <div className="err-chips">
                {chips.map((cat) => (
                  <Link key={cat.id} href={`/products?categoryIds=${cat.id}`}>
                    {cat.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  // No store (an unrecognised host, or the API is down): show the 404 on neutral chrome rather
  // than half a shop. The layout already redirects a host with no shop to the marketing site.
  if (!store) {
    return (
      <div className="store" data-brand="a">
        {body}
      </div>
    )
  }

  return (
    <div className="store" data-brand={brand} data-theme={store.appearance}>
      <StoreHeader store={store} base="" />
      <main>{body}</main>
      <StoreFooter store={store} base="" />
    </div>
  )
}
