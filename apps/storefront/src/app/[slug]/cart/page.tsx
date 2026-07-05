import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getStore } from '@/lib/api'
import { resolveBase } from '@/lib/base'
import { CartView } from '@/components/CartView'

const IcChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [store, base, t, tn] = await Promise.all([
    getStore(slug),
    resolveBase(slug),
    getTranslations('cart'),
    getTranslations('nav'),
  ])
  const href = (p: string) => `${base}${p}` || '/'

  return (
    <div className="wrap">
      <div className="crumb">
        <Link href={href('')}>{tn('home')}</Link>
        {IcChevron}
        <span className="cur">{tn('cart')}</span>
      </div>
      <h1 className="page-title">{t('title')}</h1>
      <CartView slug={slug} base={base} store={store} />
    </div>
  )
}
