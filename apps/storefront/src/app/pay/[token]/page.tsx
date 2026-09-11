import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPaymentLink } from '@/lib/api'
import { PayLinkView } from '@/components/PayLinkView'

// Tokenised, per-payer page — never index.
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Spec 08 — the public, store-agnostic payment page. Anyone with the link token can pay the payable
 * (debt / sale balance / online order / deposit) via the merchant's routed providers. The token is the
 * authorization; the amount is server-bound (resolved live, partials capped at the balance).
 */
export default async function PayLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ method?: string }>
}) {
  const { token } = await params
  const { method } = await searchParams
  const link = await getPaymentLink(token)
  if (!link) notFound()

  return (
    <div className="wrap" style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px' }}>
      <PayLinkView token={token} link={link} preferredMethod={method} />
    </div>
  )
}
