import { CartView } from '@/components/CartView'

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <CartView slug={slug} />
}
