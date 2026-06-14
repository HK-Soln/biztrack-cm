'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { addCartItem, formatMoney, getProduct } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { useCartSession } from '@/lib/cart-store'

export function ProductDetailView({ slug, productSlug }: { slug: string; productSlug: string }) {
  const router = useRouter()
  const setSessionToken = useCartSession((state) => state.setSessionToken)
  const sessionToken = useCartSession((state) => state.sessionToken)
  const [variantId, setVariantId] = useState<string | undefined>(undefined)

  const { data: product } = useQuery({
    queryKey: queryKeys.product(slug, productSlug),
    queryFn: () => getProduct(slug, productSlug),
  })

  const addMutation = useMutation({
    mutationFn: () =>
      addCartItem(slug, {
        productId: product!.id,
        variantId,
        quantity: 1,
        ...(sessionToken ? { sessionToken } : {}),
      }),
    onSuccess: (cart) => {
      setSessionToken(cart.sessionToken)
      router.push(`/${slug}/cart`)
    },
  })

  if (!product) {
    return <p className="container muted" style={{ padding: 24 }}>Product not found.</p>
  }

  const needsVariant = product.hasVariants && product.variants.length > 0
  const selected = product.variants.find((variant) => variant.id === variantId)
  const price = selected?.sellingPrice ?? product.sellingPrice
  const inStock = needsVariant ? (selected?.inStock ?? 0) : product.inStock
  const canAdd = needsVariant ? Boolean(variantId) && inStock > 0 : product.inStock > 0

  return (
    <div className="detail container">
      <div className="product-card__media" style={{ borderRadius: 14 }}>
        {product.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0]} alt={product.name} />
        ) : (
          <span>{product.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      <div>
        <h1 style={{ marginTop: 0 }}>{product.name}</h1>
        <div className="product-card__price" style={{ fontSize: 22 }}>
          {formatMoney(price, product.currency)}
        </div>
        {product.onlineDescription || product.description ? (
          <p className="muted">{product.onlineDescription ?? product.description}</p>
        ) : null}

        {needsVariant ? (
          <label style={{ display: 'block', margin: '16px 0' }}>
            <span className="muted" style={{ fontSize: 13 }}>Choose a version</span>
            <select
              value={variantId ?? ''}
              onChange={(event) => setVariantId(event.target.value || undefined)}
              style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, borderRadius: 10 }}
            >
              <option value="">Select…</option>
              {product.variants.map((variant) => (
                <option key={variant.id} value={variant.id} disabled={variant.inStock <= 0}>
                  {variant.name} — {formatMoney(variant.sellingPrice, product.currency)}
                  {variant.inStock <= 0 ? ' (out of stock)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="button"
          disabled={!canAdd || addMutation.isPending}
          onClick={() => addMutation.mutate()}
          style={{
            marginTop: 16,
            padding: '12px 20px',
            borderRadius: 12,
            border: 'none',
            background: canAdd ? 'var(--primary)' : '#cbd5e1',
            color: '#fff',
            fontWeight: 700,
            cursor: canAdd ? 'pointer' : 'not-allowed',
          }}
        >
          {addMutation.isPending ? 'Adding…' : inStock > 0 ? 'Add to cart' : 'Out of stock'}
        </button>
        {addMutation.isError ? (
          <p style={{ color: '#a32d2d' }}>{(addMutation.error as Error).message}</p>
        ) : null}
      </div>
    </div>
  )
}
