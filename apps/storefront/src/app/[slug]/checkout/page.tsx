import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getStore } from '@/lib/api'
import { resolveBase } from '@/lib/base'
import { CheckoutView } from '@/components/CheckoutView'

export const metadata: Metadata = { robots: { index: false, follow: true } }

const IcChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
const IcCheck = (
  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={3}>
    <path d="m5 12 4 4L19 6" />
  </svg>
)

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [store, base, t, tn] = await Promise.all([
    getStore(slug),
    resolveBase(slug),
    getTranslations('checkout'),
    getTranslations('nav'),
  ])
  const href = (p: string) => `${base}${p}` || '/'

  return (
    <div className="wrap">
      <div className="crumb">
        <Link href={href('/cart')}>{tn('cart')}</Link>
        {IcChevron}
        <span className="cur">{t('stepDelivery')}</span>
      </div>
      <h1 className="page-title">{t('title')}</h1>

      <div className="co-steps">
        <span className="co-step done">
          <span className="n">{IcCheck}</span>
          <span className="lbl">{t('stepCart')}</span>
        </span>
        <span className="co-sep" />
        <span className="co-step on">
          <span className="n">2</span>
          <span className="lbl">{t('stepDelivery')}</span>
        </span>
        <span className="co-sep" />
        <span className="co-step">
          <span className="n">3</span>
          <span className="lbl">{t('stepConfirm')}</span>
        </span>
      </div>

      <CheckoutView slug={slug} base={base} store={store} />
    </div>
  )
}
