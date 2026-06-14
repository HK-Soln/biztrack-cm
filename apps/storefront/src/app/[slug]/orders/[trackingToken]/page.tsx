import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatMoney, getOrderTracking } from '@/lib/api'

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ slug: string; trackingToken: string }>
}) {
  const { slug, trackingToken } = await params
  const order = await getOrderTracking(slug, trackingToken)
  if (!order) notFound()

  return (
    <div className="container" style={{ padding: '32px 16px', maxWidth: 640 }}>
      <h1 style={{ marginBottom: 4 }}>Order {order.orderNumber}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {order.customerName} · {order.fulfillmentType === 'PICKUP' ? 'Pickup' : 'Delivery'}
      </p>

      <div
        style={{
          display: 'inline-block',
          padding: '6px 14px',
          borderRadius: 999,
          background: 'var(--bg-soft)',
          fontWeight: 700,
          margin: '8px 0 16px',
        }}
      >
        {order.status}
      </div>

      <div style={{ fontWeight: 700, marginBottom: 20 }}>
        Total: {formatMoney(order.totalAmount, order.currency)}
      </div>

      <h2 style={{ fontSize: 16 }}>Updates</h2>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {order.events.map((event) => (
          <li
            key={event.id}
            style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
          >
            <div>{event.customerMessage ?? event.eventType}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {new Date(event.createdAt).toLocaleString('fr-FR')}
            </div>
          </li>
        ))}
      </ol>

      <p style={{ marginTop: 24 }}>
        <Link href={`/${slug}/products`}>Continue shopping</Link>
      </p>
    </div>
  )
}
