import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getStore } from '@/lib/api'
import { resolveBase } from '@/lib/base'
import { ContactForm } from '@/components/ContactForm'

const IcChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
const IcPin = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)
const IcPhone = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M4 5c0 9 6 15 15 15l0-4-4-1-2 2c-3-1.5-5.5-4-7-7l2-2-1-4Z" />
  </svg>
)
const IcMail = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </svg>
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const [store, t] = await Promise.all([getStore(slug), getTranslations('contact')])
  const title = `${t('title')}${store ? ` — ${store.storeName}` : ''}`
  return { title, description: t('subtitle') }
}

export default async function ContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [store, base, t, tn] = await Promise.all([
    getStore(slug),
    resolveBase(slug),
    getTranslations('contact'),
    getTranslations('nav'),
  ])
  const href = (p: string) => `${base}${p}` || '/'

  const whatsappDigits = store?.whatsappNumber?.replace(/\D/g, '') ?? null
  const hasChannel = Boolean(store?.whatsappNumber || store?.email)

  return (
    <div className="wrap">
      <div className="crumb">
        <Link href={href('')}>{tn('home')}</Link>
        {IcChevron}
        <span className="cur">{tn('contact')}</span>
      </div>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-sub">{t('subtitle')}</p>

      <div className="ct-grid">
        <div className="ct-info">
          {store?.address || store?.city ? (
            <div className="ct-item">
              <div className="ii">{IcPin}</div>
              <div>
                <div className="t">{t('addressLabel')}</div>
                <div className="d">
                  {store.address ? <>{store.address}</> : null}
                  {store.address && store.city ? <br /> : null}
                  {store.city}
                </div>
              </div>
            </div>
          ) : null}

          {store?.phone || store?.whatsappNumber ? (
            <div className="ct-item">
              <div className="ii">{IcPhone}</div>
              <div>
                <div className="t">{t('phoneLabel')}</div>
                <div className="d">
                  {store.phone ? <a href={`tel:${store.phone}`}>{store.phone}</a> : null}
                  {whatsappDigits ? (
                    <>
                      {store.phone ? <br /> : null}
                      <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer">
                        {t('whatsapp')}
                        {store.whatsappNumber ? ` · ${store.whatsappNumber}` : ''}
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {store?.email ? (
            <div className="ct-item">
              <div className="ii">{IcMail}</div>
              <div>
                <div className="t">{t('emailLabel')}</div>
                <div className="d">
                  <a href={`mailto:${store.email}`}>{store.email}</a>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {hasChannel ? (
          <ContactForm
            whatsappNumber={store?.whatsappNumber ?? null}
            email={store?.email ?? null}
          />
        ) : null}
      </div>
    </div>
  )
}
