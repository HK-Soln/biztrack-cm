import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getStore } from '@/lib/api'
import { getStoreSlug } from '@/lib/store'
import { CartView } from '@/components/CartView'

export const metadata: Metadata = { robots: { index: false, follow: true } }

const IcChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export default async function CartPage() {
  const slug = await getStoreSlug()
  if (!slug) notFound()
  const [store, t, tn] = await Promise.all([
    getStore(slug),
    getTranslations('cart'),
    getTranslations('nav'),
  ])

  return (
    <div className="wrap">
      <div className="crumb">
        <Link href="/">{tn('home')}</Link>
        {IcChevron}
        <span className="cur">{tn('cart')}</span>
      </div>
      <h1 className="page-title">{t('title')}</h1>
      <CartView slug={slug} base="" store={store} />
    </div>
  )
}
