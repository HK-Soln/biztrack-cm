'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cartItemKey, formatMoney, getCart, removeCartItem, updateCartItem } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { useCartSession } from '@/lib/cart-store'

export function CartView({ slug }: { slug: string }) {
  const sessionToken = useCartSession((state) => state.sessionToken)
  const queryClient = useQueryClient()

  const { data: cart, isLoading } = useQuery({
    queryKey: queryKeys.cart(slug, sessionToken ?? 'none'),
    queryFn: () => getCart(slug, sessionToken as string),
    enabled: Boolean(sessionToken),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.cart(slug, sessionToken ?? 'none') })

  const updateMutation = useMutation({
    mutationFn: ({ key, quantity }: { key: string; quantity: number }) =>
      updateCartItem(slug, sessionToken as string, key, quantity),
    onSuccess: invalidate,
  })
  const removeMutation = useMutation({
    mutationFn: (key: string) => removeCartItem(slug, sessionToken as string, key),
    onSuccess: invalidate,
  })

  if (!sessionToken || (!isLoading && (!cart || cart.items.length === 0))) {
    return (
      <div className="container" style={{ padding: '40px 16px', textAlign: 'center' }}>
        <p className="muted">Your cart is empty.</p>
        <Link href={`/${slug}/products`}>Browse products</Link>
      </div>
    )
  }

  if (!cart) {
    return <p className="container muted" style={{ padding: 24 }}>Loading…</p>
  }

  return (
    <div className="container" style={{ padding: '24px 16px', maxWidth: 720 }}>
      <h1>Your cart</h1>
      {cart.items.map((item) => {
        const key = cartItemKey(item)
        return (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>
                {item.productName}
                {item.variantName ? ` · ${item.variantName}` : ''}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{formatMoney(item.unitPrice)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={1}
                defaultValue={item.quantity}
                onBlur={(event) =>
                  updateMutation.mutate({ key, quantity: Math.max(1, Number(event.target.value)) })
                }
                style={{ width: 64, padding: 6, borderRadius: 8, border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                onClick={() => removeMutation.mutate(key)}
                className="muted"
                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', fontWeight: 700 }}>
        <span>Subtotal</span>
        <span>{formatMoney(cart.subtotal)}</span>
      </div>

      <Link
        href={`/${slug}/checkout`}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '12px 20px',
          borderRadius: 12,
          background: 'var(--primary)',
          color: '#fff',
          fontWeight: 700,
        }}
      >
        Checkout
      </Link>
    </div>
  )
}
