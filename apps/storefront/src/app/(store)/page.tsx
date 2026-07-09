import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CategoryTreeNode } from '@biztrack/types'
import { notFound } from 'next/navigation'
import { getStore, getCategories, listProducts } from '@/lib/api'
import { getStoreSlug } from '@/lib/store'
import { getQueryClient, queryKeys } from '@/lib/query'
import { ProductRail } from '@/components/ProductRail'

// ---- icons ---------------------------------------------------------------
const IcTruck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
    <circle cx="7" cy="17" r="1.6" />
    <circle cx="17" cy="17" r="1.6" />
  </svg>
)
const IcLock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)
const IcShield = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)
const IcWallet = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M16 14h2" />
  </svg>
)
const IcStore = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 9h16l-1-4H5L4 9Z" />
    <path d="M5 9v10h14V9M9 19v-5h6v5" />
  </svg>
)
const IcHeadset = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
    <rect x="3" y="13" width="4" height="6" rx="1.5" />
    <rect x="17" y="13" width="4" height="6" rx="1.5" />
    <path d="M20 19a4 4 0 0 1-4 3h-2" />
  </svg>
)
const IcTag = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M3 12V4h8l9 9-8 8-9-9Z" />
    <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)
const IcArrow = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

const PAY_DOT: Record<string, string> = {
  cashOnDelivery: '#22c55e',
  mtnMomo: '#ffcc00',
  orangeMoney: '#ff7a00',
  card: '#3b82f6',
}

export default async function StoreHomePage() {
  const slug = await getStoreSlug()
  if (!slug) notFound()
  const base = ''
  const [store, categoryTree, t, tp] = await Promise.all([
    getStore(slug),
    getCategories(slug),
    getTranslations('home'),
    getTranslations('payment'),
  ])

  const query = { page: 1, limit: 8 }
  // Server-prefetch the featured rail → SSR first paint + client hydration.
  const queryClient = getQueryClient()
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  const href = (p: string) => `${base}${p}` || '/'
  const categories: CategoryTreeNode[] = (categoryTree?.tree ?? [])
    .filter((c) => c.productCount > 0 && c.showOnline !== false)
    .slice(0, 6)

  const fulfilment = store?.fulfilment
  const payment = store?.paymentMethods

  // Trust chips (hero) — driven by what the store actually offers.
  const trust: Array<{ icon: React.ReactNode; label: string }> = []
  if (fulfilment?.offerDelivery) trust.push({ icon: IcTruck, label: t('trustDelivery') })
  if (payment?.cashOnDelivery) trust.push({ icon: IcLock, label: t('trustPayOnDelivery') })
  trust.push({ icon: IcShield, label: t('trustAuthentic') })

  // Value props — first one reflects the fulfilment on offer.
  const vprops: Array<{ icon: React.ReactNode; title: string; desc: string }> = []
  if (fulfilment?.offerDelivery) {
    vprops.push({ icon: IcTruck, title: t('vpropDeliveryTitle'), desc: t('vpropDeliveryDesc') })
  } else if (fulfilment?.offerPickup) {
    vprops.push({ icon: IcStore, title: t('vpropPickupTitle'), desc: t('vpropPickupDesc') })
  } else {
    vprops.push({ icon: IcTruck, title: t('vpropDeliveryTitle'), desc: t('vpropDeliveryDesc') })
  }
  vprops.push({ icon: IcWallet, title: t('vpropPayTitle'), desc: t('vpropPayDesc') })
  vprops.push({ icon: IcShield, title: t('vpropAuthenticTitle'), desc: t('vpropAuthenticDesc') })
  vprops.push({ icon: IcHeadset, title: t('vpropSupportTitle'), desc: t('vpropSupportDesc') })

  const payBadges = (['cashOnDelivery', 'mtnMomo', 'orangeMoney', 'card'] as const).filter(
    (key) => payment?.[key],
  )

  return (
    <>
      {/* Hero */}
      <div className="wrap">
        <section className="hero">
          <div className="ht">
            <span className="eb">{store?.city ?? t('heroEyebrow')}</span>
            <h1>{store?.tagline?.trim() || store?.storeName}</h1>
            <p>{t('heroSubtitle')}</p>
            <div className="cta">
              <Link className="btn" href={href('/products')}>
                {t('shopNow')}
              </Link>
              <Link className="btn outline" href={href('/contact')}>
                {t('contactUs')}
              </Link>
            </div>
            {trust.length ? (
              <div className="trust">
                {trust.map((item) => (
                  <span className="ti" key={item.label}>
                    {item.icon}
                    {item.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="hi">
            {store?.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.bannerUrl} alt={store.storeName} />
            ) : (
              <span className="ph">{store?.storeName}</span>
            )}
          </div>
        </section>
      </div>

      {/* Categories */}
      {categories.length ? (
        <section className="sec">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <h2>{t('categoriesTitle')}</h2>
                <p>{t('categoriesSubtitle')}</p>
              </div>
              <Link className="all" href={href('/products')}>
                {t('viewAll')} {IcArrow}
              </Link>
            </div>
            <div className="cat-strip">
              {categories.map((cat) => (
                <Link className="cat" key={cat.id} href={href(`/products?categoryIds=${cat.id}`)}>
                  <div className="ci">{IcTag}</div>
                  <div className="cn">{cat.name}</div>
                  <div className="cc">{t('productCount', { count: cat.productCount })}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Value props */}
      <section className="sec">
        <div className="wrap">
          <div className="vprops">
            {vprops.map((vp) => (
              <div className="vprop" key={vp.title}>
                <div className="vi">{vp.icon}</div>
                <div>
                  <div className="vt">{vp.title}</div>
                  <div className="vd">{vp.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured products */}
      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2>{t('featuredTitle')}</h2>
              <p>{t('featuredSubtitle')}</p>
            </div>
            <Link className="all" href={href('/products')}>
              {t('viewAll')} {IcArrow}
            </Link>
          </div>
          <HydrationBoundary state={dehydrate(queryClient)}>
            <ProductRail slug={slug} base={base} query={query} />
          </HydrationBoundary>
        </div>
      </section>

      {/* Payment promo band */}
      {payBadges.length ? (
        <div className="wrap" style={{ paddingBottom: 44 }}>
          <section className="promo">
            <div className="pt">
              <span className="eb">{t('promoEyebrow')}</span>
              <h3>{t('promoTitle')}</h3>
              <p>{t('promoSubtitle')}</p>
            </div>
            <div className="pay-badges">
              {payBadges.map((key) => (
                <span className="pay-badge" key={key}>
                  <span className="dotp" style={{ background: PAY_DOT[key] }} />
                  {tp(key)}
                </span>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
