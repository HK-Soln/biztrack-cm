'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import type { CheckoutRequest, OnlineFulfillmentType, PublicStore } from '@biztrack/types'
import { checkout, formatMoney, getCart } from '@/lib/api'
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

  const { data: cart } = useQuery({
    queryKey: queryKeys.cart(slug, sessionToken ?? 'none'),
    queryFn: () => getCart(slug, sessionToken as string),
    enabled: Boolean(sessionToken),
  })

  const mutation = useMutation({
    mutationFn: (payload: CheckoutRequest) => checkout(slug, sessionToken as string, payload),
    onSuccess: (order) => {
      clearSession()
      router.push(`${base}/orders/${order.trackingToken}`)
    },
  })

  const subtotal = cart?.subtotal ?? 0
  const isDelivery = fulfillmentType === 'DELIVERY'
  const fee = isDelivery && offerDelivery ? deliveryFee : 0
  const total = subtotal + fee
  const belowMin = minOrder != null && subtotal < minOrder
  const items = cart?.items ?? []

  if (!sessionToken || (cart && items.length === 0)) {
    return (
      <p className="page-sub" style={{ padding: '10px 0 40px' }}>
        {tc('emptyTitle')} — <Link href={`${base}/products`}>{tc('startShopping')}</Link>
      </p>
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

        {/* payment — COD only for now */}
        <div className="cocard">
          <h3>
            <span className="sn">3</span>
            {t('paymentHeading')}
          </h3>
          <p className="csub">{t('paymentSub')}</p>
          <div className="pay-list">
            <div className="payopt on">
              <span className="plogo" style={{ background: 'var(--success)' }}>
                CASH
              </span>
              <span className="pi">
                <span className="t">{t('codTitle')}</span>
                <span className="d">{t('codDesc')}</span>
              </span>
              <span className="rdo" />
            </div>
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
