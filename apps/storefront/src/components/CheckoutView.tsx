'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import type { CheckoutRequest, OnlineFulfillmentType, PublicStore } from '@biztrack/types'
import { checkout, formatMoney, getCart, getPaymentStatus } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { useCartSession } from '@/lib/cart-store'

const IcTruck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
    <circle cx="7" cy="17" r="1.6" />
    <circle cx="17" cy="17" r="1.6" />
  </svg>
)
const IcStore = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 9h16l-1-5H5L4 9Z" />
    <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
  </svg>
)
const IcLock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)
const IcCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export function CheckoutView({
  slug,
  base,
  store,
}: {
  slug: string
  base: string
  store: PublicStore | null
}) {
  const t = useTranslations('checkout')
  const tc = useTranslations('cart')
  const router = useRouter()
  const sessionToken = useCartSession((s) => s.sessionToken)
  const clearSession = useCartSession((s) => s.clear)

  const offerDelivery = store?.fulfilment.offerDelivery ?? true
  const offerPickup = store?.fulfilment.offerPickup ?? false
  const deliveryFee = store?.fulfilment.deliveryFee ?? 0
  const deliveryCities = store?.fulfilment.deliveryCities ?? []
  const currency = store?.currency ?? 'XAF'
  const minOrder = store?.minOrderAmount ?? null

  const [fulfillmentType, setFulfillmentType] = useState<OnlineFulfillmentType>(
    offerDelivery ? 'DELIVERY' : offerPickup ? 'PICKUP' : 'DELIVERY',
  )
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState(deliveryCities[0] ?? store?.city ?? '')
  const [instructions, setInstructions] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Payment options come from the published store flags (which the admin can only enable when the
  // provider route is fully set up). COD needs no provider; the others redirect to a hosted page.
  const pm = store?.paymentMethods
  const payOptions = useMemo(() => {
    const opts: { key: string; title: string; desc: string; badge: string; color: string }[] = []
    if (pm?.cashOnDelivery ?? true)
      opts.push({
        key: 'CASH',
        title: t('codTitle'),
        desc: t('codDesc'),
        badge: 'CASH',
        color: 'var(--success)',
      })
    if (pm?.card)
      opts.push({
        key: 'CARD',
        title: t('cardTitle'),
        desc: t('cardDesc'),
        badge: 'CARD',
        color: '#635bff',
      })
    if (pm?.mtnMomo)
      opts.push({
        key: 'MTN_MOMO',
        title: t('mtnTitle'),
        desc: t('momoDesc'),
        badge: 'MTN',
        color: '#f5b301',
      })
    if (pm?.orangeMoney)
      opts.push({
        key: 'ORANGE_MONEY',
        title: t('orangeTitle'),
        desc: t('momoDesc'),
        badge: 'OM',
        color: '#ff6a00',
      })
    return opts
  }, [pm, t])
  const [paymentMethod, setPaymentMethod] = useState<string>(payOptions[0]?.key ?? 'CASH')

  const { data: cart } = useQuery({
    queryKey: queryKeys.cart(slug, sessionToken ?? 'none'),
    queryFn: () => getCart(slug, sessionToken as string),
    enabled: Boolean(sessionToken),
  })

  // A pending push payment (MoMo request-to-pay): show the "approve on your phone" wait screen, poll
  // the status endpoint, and on a result show it with a short countdown before redirecting.
  const [awaiting, setAwaiting] = useState<string | null>(null) // tracking token
  const [result, setResult] = useState<'PAID' | 'FAILED' | null>(null)
  const [countdown, setCountdown] = useState(10)

  const mutation = useMutation({
    mutationFn: (payload: CheckoutRequest) => checkout(slug, sessionToken as string, payload),
    onSuccess: (order) => {
      clearSession()
      // Hosted redirect (Stripe) → send the customer to the provider's page.
      if (order.payment?.url) {
        window.location.href = order.payment.url
        return
      }
      // Push (MoMo) → wait screen + poll; the customer approves on their phone.
      if (order.payment?.pending) {
        setResult(null)
        setAwaiting(order.trackingToken)
        return
      }
      // COD / no provider payment → straight to the order page.
      router.push(`${base}/orders/${order.trackingToken}`)
    },
  })

  // Poll the payment status while awaiting approval. On a terminal state, record the result (don't
  // redirect yet — the countdown below handles that). After ~2 min still pending, hand off.
  const startedRef = useRef(0)
  useEffect(() => {
    if (!awaiting || result) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    if (!startedRef.current) startedRef.current = Date.now()
    const tick = async () => {
      const res = await getPaymentStatus(slug, awaiting)
      if (!active) return
      if (res?.status === 'PAID') return setResult('PAID')
      if (res?.status === 'FAILED') return setResult('FAILED')
      if (Date.now() - startedRef.current < 120_000) timer = setTimeout(tick, 3000)
      else router.push(`${base}/orders/${awaiting}`)
    }
    timer = setTimeout(tick, 2500)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [awaiting, result, slug, base, router])

  // Once resolved, count down from 10s then redirect to the order page (or let them skip with a button).
  useEffect(() => {
    if (!awaiting || !result) return
    setCountdown(10)
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id)
          router.push(`${base}/orders/${awaiting}${result === 'PAID' ? '?paid=1' : ''}`)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [awaiting, result, base, router])

  const subtotal = cart?.subtotal ?? 0
  const isDelivery = fulfillmentType === 'DELIVERY'
  const fee = isDelivery && offerDelivery ? deliveryFee : 0
  const total = subtotal + fee
  const belowMin = minOrder != null && subtotal < minOrder
  const items = cart?.items ?? []

  // Awaiting a MoMo approval — takes precedence over the empty-cart check (the session is cleared on
  // a successful checkout, so this must render before that guard).
  if (awaiting) {
    const paid = result === 'PAID'
    return (
      <div className="empty" style={{ maxWidth: 480 }}>
        {result ? (
          <>
            <div className="ei" style={{ color: paid ? 'var(--success)' : 'var(--danger)' }}>
              {paid ? IcCheck : IcLock}
            </div>
            <h3>{paid ? t('momoPaidTitle') : t('momoFailedTitle')}</h3>
            <p>{paid ? t('momoPaidDesc') : t('momoFailed')}</p>
            <p style={{ marginTop: 10, color: 'var(--muted)' }}>
              {t('momoRedirectIn', { n: countdown })}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              style={{ marginTop: 18 }}
              onClick={() => router.push(`${base}/orders/${awaiting}${paid ? '?paid=1' : ''}`)}
            >
              {t('momoContinueNow')}
            </button>
          </>
        ) : (
          <>
            <div className="ei">{IcLock}</div>
            <h3>{t('momoWaitTitle')}</h3>
            <p>{t('momoWaitDesc', { phone: phone ?? '' })}</p>
            <p style={{ marginTop: 10, color: 'var(--muted)' }}>{t('momoChecking')}</p>
          </>
        )}
      </div>
    )
  }

  if (!sessionToken || (cart && items.length === 0)) {
    return (
      <div className="empty">
        <div className="ei">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <circle cx="9" cy="20" r="1.5" />
            <circle cx="18" cy="20" r="1.5" />
            <path d="M2 3h3l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
          </svg>
        </div>
        <h3>{tc('emptyTitle')}</h3>
        <p>{tc('emptyDesc')}</p>
        <Link
          className="btn btn-primary btn-lg"
          style={{ marginTop: 22 }}
          href={`${base}/products`}
        >
          {tc('startShopping')}
        </Link>
      </div>
    )
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (fullName.trim().length < 2) next.fullName = t('errName')
    if (!isValidPhone(phone)) next.phone = t('errPhone')
    if (isDelivery && !address.trim()) next.address = t('errAddress')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (belowMin || !validate()) return
    mutation.mutate({
      customerName: fullName.trim(),
      customerPhone: phone as string,
      customerEmail: email.trim() || undefined,
      fulfillmentType,
      deliveryAddress: isDelivery ? address.trim() : undefined,
      deliveryCity: isDelivery ? city.trim() || undefined : undefined,
      deliveryNotes: isDelivery && instructions.trim() ? instructions.trim() : undefined,
      paymentMethod,
      // Our origin — the server builds the hosted-payment return URLs from this + the order token.
      returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    })
  }

  return (
    <form className="checkout" onSubmit={onSubmit}>
      {/* left: forms */}
      <div>
        {/* contact */}
        <div className="cocard">
          <h3>
            <span className="sn">1</span>
            {t('contactHeading')}
          </h3>
          <p className="csub">{t('contactSub')}</p>
          <div className="field-grid">
            <div className="field full">
              <label>{t('fullName')}</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              {errors.fullName ? (
                <span
                  style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4, display: 'block' }}
                >
                  {errors.fullName}
                </span>
              ) : null}
            </div>
            <div className="field full">
              <label>{t('phone')}</label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                defaultCountry="CM"
                error={!!errors.phone}
              />
              {errors.phone ? (
                <span
                  style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4, display: 'block' }}
                >
                  {errors.phone}
                </span>
              ) : null}
            </div>
            <div className="field full">
              <label>{t('email')}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        </div>

        {/* fulfilment */}
        <div className="cocard">
          <h3>
            <span className="sn">2</span>
            {t('fulfilmentHeading')}
          </h3>
          <p className="csub">{t('fulfilmentSub')}</p>
          <div className="opt-cards">
            {offerDelivery ? (
              <button
                type="button"
                className={`optcard${isDelivery ? ' on' : ''}`}
                onClick={() => setFulfillmentType('DELIVERY')}
              >
                <span className="rdo" />
                <span className="oi">{IcTruck}</span>
                <div className="ot">{t('delivery')}</div>
                <div className="od">{t('deliveryDesc')}</div>
                <div className="op">
                  {deliveryFee > 0 ? formatMoney(deliveryFee, currency) : t('free')}
                </div>
              </button>
            ) : null}
            {offerPickup ? (
              <button
                type="button"
                className={`optcard${!isDelivery ? ' on' : ''}`}
                onClick={() => setFulfillmentType('PICKUP')}
              >
                <span className="rdo" />
                <span className="oi">{IcStore}</span>
                <div className="ot">{t('pickup')}</div>
                <div className="od">{store?.fulfilment.pickupAddress || t('pickupDesc')}</div>
                <div className="op">{t('free')}</div>
              </button>
            ) : null}
          </div>

          {isDelivery ? (
            <div style={{ marginTop: 18 }}>
              <div className="field-grid">
                <div className="field full">
                  <label>{t('address')}</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} />
                  {errors.address ? (
                    <span
                      style={{
                        color: 'var(--danger)',
                        fontSize: 12,
                        marginTop: 4,
                        display: 'block',
                      }}
                    >
                      {errors.address}
                    </span>
                  ) : null}
                </div>
                <div className="field full">
                  <label>{t('city')}</label>
                  {deliveryCities.length > 0 ? (
                    <select value={city} onChange={(e) => setCity(e.target.value)}>
                      {deliveryCities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={city} onChange={(e) => setCity(e.target.value)} />
                  )}
                </div>
                <div className="field full">
                  <label>{t('instructions')}</label>
                  <textarea
                    rows={2}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* payment */}
        <div className="cocard">
          <h3>
            <span className="sn">3</span>
            {t('paymentHeading')}
          </h3>
          <p className="csub">{t('paymentSub')}</p>
          <div className="pay-list">
            {payOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`payopt${paymentMethod === o.key ? ' on' : ''}`}
                onClick={() => setPaymentMethod(o.key)}
              >
                <span className="plogo" style={{ background: o.color }}>
                  {o.badge}
                </span>
                <span className="pi">
                  <span className="t">{o.title}</span>
                  <span className="d">{o.desc}</span>
                </span>
                <span className="rdo" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* right: summary */}
      <aside className="summary co-summary">
        <h3>{t('orderSummary')}</h3>
        <div>
          {items.map((item, i) => (
            <div className="co-mini-line" key={`${item.productId}-${i}`}>
              <div className="th">
                <span className="qb">{item.quantity}</span>
              </div>
              <div className="nm">
                {item.productName}
                {item.variantName ? <div className="v">{item.variantName}</div> : null}
              </div>
              <div className="lt">{formatMoney(item.unitPrice * item.quantity, currency)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="sumrow">
            <span>{t('subtotal')}</span>
            <span className="v">{formatMoney(subtotal, currency)}</span>
          </div>
          {isDelivery ? (
            <div className="sumrow">
              <span>{t('deliveryLine')}</span>
              <span className="v">
                {fee > 0 ? formatMoney(fee, currency) : <span className="free">{t('free')}</span>}
              </span>
            </div>
          ) : null}
          <div className="sum-grand">
            <span className="l">{t('total')}</span>
            <span className="g">{formatMoney(total, currency)}</span>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg btn-block"
          style={{ marginTop: 16 }}
          disabled={mutation.isPending || belowMin}
        >
          {IcLock}
          {mutation.isPending ? t('placing') : t('placeOrder')}
        </button>

        {mutation.isError ? (
          <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: 13 }}>
            {(mutation.error as Error).message}
          </p>
        ) : null}
      </aside>
    </form>
  )
}
