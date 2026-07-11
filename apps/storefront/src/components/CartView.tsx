'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { PublicStore } from '@biztrack/types'
import { cartItemKey, formatMoney, getCart, removeCartItem, updateCartItem } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { useCartSession } from '@/lib/cart-store'

const IcCart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M2 3h3l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
  </svg>
)
const IcTrash = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
  </svg>
)
const IcBack = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)
const IcLock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)

export function CartView({
  slug,
  base,
  store,
}: {
  slug: string
  base: string
  store: PublicStore | null
}) {
  const t = useTranslations('cart')
  const sessionToken = useCartSession((s) => s.sessionToken)
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
  const clearMutation = useMutation({
    mutationFn: async () => {
      for (const item of cart?.items ?? []) {
        await removeCartItem(slug, sessionToken as string, cartItemKey(item))
      }
    },
    onSuccess: invalidate,
  })

  const currency = store?.currency ?? 'XAF'
  const busy = updateMutation.isPending || removeMutation.isPending || clearMutation.isPending

  if (!sessionToken || (!isLoading && (!cart || cart.items.length === 0))) {
    return (
      <div className="empty">
        <div className="ei">{IcCart}</div>
        <h3>{t('emptyTitle')}</h3>
        <p>{t('emptyDesc')}</p>
        <Link
          className="btn btn-primary btn-lg"
          style={{ marginTop: 22 }}
          href={`${base}/products`}
        >
          {t('startShopping')}
        </Link>
      </div>
    )
  }

  if (!cart) {
    return (
      <p className="page-sub" style={{ padding: '20px 0' }}>
        {t('loading')}
      </p>
    )
  }

  const itemCount = cart.items.reduce((n, it) => n + it.quantity, 0)
  const minOrder = store?.minOrderAmount ?? null
  const belowMin = minOrder != null && cart.subtotal < minOrder

  return (
    <div className="cart">
      <div>
        <div className="cart-lines">
          {cart.items.map((item) => {
            const key = cartItemKey(item)
            return (
              <div className="cart-line" key={key}>
                <div className="th">
                  <span>{item.productName.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="ci">
                  <div className="nm">{item.productName}</div>
                  {item.variantName ? <div className="va">{item.variantName}</div> : null}
                  <div className="up">
                    {t('unit', { price: formatMoney(item.unitPrice, currency) })}
                  </div>
                  <div style={{ marginTop: 11 }}>
                    <span className="stepper sm">
                      <button
                        type="button"
                        disabled={busy || item.quantity <= 1}
                        onClick={() => updateMutation.mutate({ key, quantity: item.quantity - 1 })}
                      >
                        −
                      </button>
                      <span className="q">{item.quantity}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateMutation.mutate({ key, quantity: item.quantity + 1 })}
                      >
                        +
                      </button>
                    </span>
                  </div>
                </div>
                <div className="rt">
                  <span className="lt">
                    {formatMoney(item.unitPrice * item.quantity, currency)}
                  </span>
                  <button
                    type="button"
                    className="rm"
                    disabled={busy}
                    onClick={() => removeMutation.mutate(key)}
                  >
                    {IcTrash}
                    {t('remove')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 18,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Link className="btn" href={`${base}/products`}>
            {IcBack}
            {t('continueShopping')}
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => clearMutation.mutate()}
          >
            {IcTrash}
            {t('clear')}
          </button>
        </div>
      </div>

      <aside className="summary">
        <h3>{t('summary')}</h3>
        <div className="sumrow">
          <span>{t('itemsCount', { count: itemCount })}</span>
          <span className="v">{formatMoney(cart.subtotal, currency)}</span>
        </div>

        {belowMin ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--brand)',
              background: 'var(--brand-soft)',
              padding: '9px 12px',
              borderRadius: 10,
              margin: '6px 0',
            }}
          >
            {t('minOrder', {
              amount: formatMoney(minOrder - cart.subtotal, currency),
              min: formatMoney(minOrder, currency),
            })}
          </div>
        ) : null}

        <div className="sum-grand">
          <span className="l">{t('total')}</span>
          <span className="g">{formatMoney(cart.subtotal, currency)}</span>
        </div>

        {belowMin ? (
          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} disabled>
            {t('checkout')}
          </button>
        ) : (
          <Link
            className="btn btn-primary btn-lg btn-block"
            style={{ marginTop: 16 }}
            href={`${base}/checkout`}
          >
            {t('checkout')}
          </Link>
        )}

        <div className="trust-line">
          {IcLock}
          {t('securePayment')}
        </div>
      </aside>
    </div>
  )
}
