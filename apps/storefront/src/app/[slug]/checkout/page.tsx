import { CheckoutView } from '@/components/CheckoutView'

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <CheckoutView slug={slug} />
}
