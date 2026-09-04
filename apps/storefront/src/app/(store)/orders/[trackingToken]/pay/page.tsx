import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getOrderTracking, getStore } from '@/lib/api'
import { getStoreSlug } from '@/lib/store'
import { PaymentView } from '@/components/PaymentView'

// Tokenised, per-customer page — never index.
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Our own hosted payment page for self-handled providers (MTN MoMo request-to-pay) — and the fallback
 * for a hosted provider whose link couldn't be generated at checkout. The order is already placed; this
 * page starts + manages the payment (enter number → push → poll → retry) in isolation, so a payment
 * problem never touches order creation.
 */
export default async function OrderPaymentPage({
  params,
}: {
  params: Promise<{ trackingToken: string }>
}) {
  const { trackingToken } = await params
  const slug = await getStoreSlug()
  if (!slug) notFound()
  const [order, store] = await Promise.all([
    getOrderTracking(slug, trackingToken),
    getStore(slug),
  ])
  if (!order) notFound()

  // Nothing to pay online (COD) or already settled → the order page.
  const method = (order.paymentMethod ?? '').toUpperCase()
  const online = method === 'MTN_MOMO' || method === 'ORANGE_MONEY' || method === 'CARD'
  if (!online || order.paymentStatus === 'PAID') redirect(`/orders/${trackingToken}`)

  return (
    <div className="wrap">
      <PaymentView slug={slug} base="" trackingToken={trackingToken} order={order} store={store} />
    </div>
  )
}
