import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getReceiptHtml } from '@/lib/api'
import { ReceiptView } from '@/components/ReceiptView'

// A per-sale receipt — never index.
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Public digital receipt — the QR on a printed receipt links here (/r/<saleId>). Store-agnostic
 * (renders on the root host); the sale id is the capability. Fetches the rendered receipt HTML from
 * the API and shows it with a print button.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params
  const html = await getReceiptHtml(saleId)
  if (!html) notFound()
  return <ReceiptView html={html} />
}
