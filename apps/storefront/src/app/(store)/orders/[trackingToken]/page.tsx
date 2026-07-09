import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

// Tokenised, per-customer page — never index.
export const metadata: Metadata = { robots: { index: false, follow: false } }
import type { OnlineOrderStatus, PublicOrderTracking } from '@biztrack/types'
import { formatMoney, getOrderTracking, getStore } from '@/lib/api'
import { getStoreSlug } from '@/lib/store'

const DELIVERY_STEPS: OnlineOrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]
const PICKUP_STEPS: OnlineOrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
]
const OFF_PATH: OnlineOrderStatus[] = ['CANCELLED', 'RETURNED', 'DELIVERY_FAILED']

type Row = { status: OnlineOrderStatus; state: 'done' | 'now' | 'future'; at: string | null }

function buildTimeline(order: PublicOrderTracking): Row[] {
  const steps = order.fulfillmentType === 'PICKUP' ? PICKUP_STEPS : DELIVERY_STEPS
  const timeByStatus: Partial<Record<string, string>> = {}
  for (const e of order.events) {
    if (e.toStatus && !timeByStatus[e.toStatus]) timeByStatus[e.toStatus] = e.createdAt
  }
  const offPath = OFF_PATH.includes(order.status)
  const currentIndex = steps.indexOf(order.status)
  const terminalComplete = order.status === 'DELIVERED' || order.status === 'PICKED_UP'
  let reachedIndex = -1
  steps.forEach((s, i) => {
    if (timeByStatus[s]) reachedIndex = i
  })

  return steps.map((s, i) => {
    let state: Row['state']
    if (offPath) state = i <= reachedIndex ? 'done' : 'future'
    else if (i < currentIndex) state = 'done'
    else if (i === currentIndex) state = terminalComplete ? 'done' : 'now'
    else state = 'future'
    return { status: s, state, at: timeByStatus[s] ?? null }
  })
}

const IcCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
    <path d="m5 12 4 4L19 6" />
  </svg>
)
const IcCheckSm = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
    <path d="m5 12 4 4L19 6" />
  </svg>
)
const IcMsg = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 5h16v12H7l-3 3V5Z" />
  </svg>
)

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ trackingToken: string }>
}) {
  const { trackingToken } = await params
  const slug = await getStoreSlug()
  if (!slug) notFound()
  const [order, store, locale, t] = await Promise.all([
    getOrderTracking(slug, trackingToken),
    getStore(slug),
    getLocale(),
    getTranslations('order'),
  ])
  if (!order) notFound()

  const href = (p: string) => p || '/'
  const rows = buildTimeline(order)
  const isDelivery = order.fulfillmentType === 'DELIVERY'
  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  const offBanner =
    order.status === 'CANCELLED'
      ? t('cancelledBanner')
      : order.status === 'RETURNED'
        ? t('returnedBanner')
        : order.status === 'DELIVERY_FAILED'
          ? t('failedBanner')
          : null

  return (
    <div className="wrap">
      <div className="oc-hero">
        <div className="oc-check">{IcCheck}</div>
        <h1>{t('thanksTitle')}</h1>
        <p>{t('thanksSub')}</p>
        <div className="oc-num">
          {t('orderLabel')} <span className="cur">#{order.orderNumber}</span>
        </div>
      </div>

      <div className="oc-grid">
        {/* tracking */}
        <div className="track">
          <h3>{t('trackingTitle')}</h3>
          <div className="tsub">{isDelivery ? t('delivery') : t('pickup')}</div>

          {offBanner ? (
            <div
              style={{
                background: 'var(--danger-soft, var(--brand-soft))',
                color: 'var(--danger)',
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 14px',
                borderRadius: 10,
                margin: '14px 0',
              }}
            >
              {offBanner}
            </div>
          ) : null}

          <div className="tl2">
            {rows.map((row) => (
              <div className={`row ${row.state}`} key={row.status}>
                <div className="dot">{row.state === 'done' ? IcCheckSm : null}</div>
                <div className="tx">
                  <div className="t">{t(`status.${row.status}`)}</div>
                  <div className="d">
                    {row.at
                      ? dateFmt(row.at)
                      : row.state === 'now'
                        ? t('inProgress')
                        : t('upcoming')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
            <Link className="btn" href={href('/contact')}>
              {IcMsg}
              {t('contactStore')}
            </Link>
            <Link className="btn" href={href('/products')}>
              {t('continueShopping')}
            </Link>
          </div>
        </div>

        {/* side */}
        <div className="oc-side">
          <div className="oc-box">
            <div className="bl">{t('summary')}</div>
            <div style={{ paddingTop: 4 }}>
              <div className="sum-grand" style={{ marginTop: 0 }}>
                <span className="l">{t('totalPaid')}</span>
                <span className="g">{formatMoney(order.totalAmount, order.currency)}</span>
              </div>
            </div>
          </div>
          <div className="oc-box">
            <div className="bl">{t('customer')}</div>
            <div className="addr">
              <b>{order.customerName}</b>
              <br />
              <span className="mut">{isDelivery ? t('delivery') : t('pickup')}</span>
              {store?.city ? (
                <>
                  {' · '}
                  <span className="mut">{store.city}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
