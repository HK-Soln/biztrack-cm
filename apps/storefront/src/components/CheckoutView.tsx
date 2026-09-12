'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import {
  resolveCheckoutPayment,
  resolveDeliveryFee,
  type CheckoutRequest,
  type OnlineFulfillmentType,
  type PublicStore,
} from '@biztrack/types'
import { checkout, formatMoney, getCart, getCities, getCountries, getRegions } from '@/lib/api'
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
  const currency = store?.currency ?? 'XAF'
  const minOrder = store?.minOrderAmount ?? null

  const [fulfillmentType, setFulfillmentType] = useState<OnlineFulfillmentType>(
    offerDelivery ? 'DELIVERY' : offerPickup ? 'PICKUP' : 'DELIVERY',
  )
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [instructions, setInstructions] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Payment options come from the published store flags. Unified flow (Spec 09): the customer chooses
  // COD or "Pay online" — any online choice redirects to the single /pay/{token} page where they pick
  // the actual method (card / MoMo). No need to pick a specific provider here.
  const pm = store?.paymentMethods
  // The provider method sent to the API for an online order (any routable one triggers link creation);
  // the pay page then offers all enabled methods, so this is only the initial pre-selection.
  const onlinePreferred = pm?.card
    ? 'CARD'
    : pm?.mtnMomo
      ? 'MTN_MOMO'
      : pm?.orangeMoney
        ? 'ORANGE_MONEY'
        : null
  const { data: cart } = useQuery({
    queryKey: queryKeys.cart(slug, sessionToken ?? 'none'),
    queryFn: () => getCart(slug, sessionToken as string),
    enabled: Boolean(sessionToken),
  })

  // Structured-address selects (Spec 10 ③): country → region → city, backing the delivery-zone fee.
  const countriesQ = useQuery({ queryKey: ['geo', 'countries'], queryFn: getCountries })
  const regionsQ = useQuery({
    queryKey: ['geo', 'regions', country],
    queryFn: () => getRegions(country),
    enabled: Boolean(country),
  })
  const citiesQ = useQuery({
    queryKey: ['geo', 'cities', country, region],
    queryFn: () => getCities(country, region),
    enabled: Boolean(country && region),
  })
  // Default the country to the first supported one once loaded.
  useEffect(() => {
    if (!country && countriesQ.data?.length) setCountry(countriesQ.data[0]!.iso2)
  }, [country, countriesQ.data])

  const subtotal = cart?.subtotal ?? 0
  const isDelivery = fulfillmentType === 'DELIVERY'
  const feeResult = useMemo(
    () =>
      resolveDeliveryFee(
        {
          deliveryZones: store?.fulfilment.deliveryZones ?? [],
          deliveryFee: store?.fulfilment.deliveryFee ?? 0,
          freeDeliveryOverAmount: store?.fulfilment.freeDeliveryOverAmount ?? null,
          unlistedAreaBehavior: store?.fulfilment.unlistedAreaBehavior ?? 'DEFAULT_FEE',
          unlistedDefaultFee: store?.fulfilment.unlistedDefaultFee ?? 0,
        },
        { countryIso2: country, region, city },
        subtotal,
      ),
    [store, country, region, city, subtotal],
  )
  const fee = isDelivery && offerDelivery ? feeResult.fee : 0
  const notDeliverable = isDelivery && offerDelivery && !feeResult.deliverable
  const arrangeDelivery = isDelivery && offerDelivery && feeResult.arrangeSeparately
  const total = subtotal + fee
  const belowMin = minOrder != null && subtotal < minOrder
  const items = cart?.items ?? []

  // Payment eligibility (Spec 10 ②) — which modes to offer + the deposit bounds, from the store config
  // + the order total. deposit_required removes full COD so it can't be bypassed.
  const prepay = store?.prepayment
  const eligibility = useMemo(
    () =>
      resolveCheckoutPayment(
        {
          allowPartialPayment: prepay?.allowPartialPayment ?? false,
          partialMinPercent: prepay?.partialMinPercent ?? 50,
          partialMinOrderAmount: prepay?.partialMinOrderAmount ?? 0,
          depositRequired: prepay?.depositRequired ?? false,
          codMinOrderAmount: prepay?.codMinOrderAmount ?? 0,
          codMaxOrderAmount: prepay?.codMaxOrderAmount ?? null,
        },
        {
          cashOnDelivery: pm?.cashOnDelivery ?? true,
          mtnMomo: pm?.mtnMomo ?? false,
          orangeMoney: pm?.orangeMoney ?? false,
          card: pm?.card ?? false,
        },
        total,
      ),
    [prepay, pm, total],
  )
  type PayMode = 'FULL_ONLINE' | 'DEPOSIT' | 'FULL_COD'
  const modes = useMemo(() => {
    const arr: { key: PayMode; title: string; desc: string; badge: string; color: string }[] = []
    if (eligibility.fullOnline)
      arr.push({ key: 'FULL_ONLINE', title: t('payOnlineTitle'), desc: t('payOnlineDesc'), badge: '⚡', color: 'var(--brand)' })
    if (eligibility.deposit)
      arr.push({ key: 'DEPOSIT', title: t('depositTitle'), desc: t('depositDesc'), badge: '½', color: 'var(--brand)' })
    if (eligibility.fullCod)
      arr.push({ key: 'FULL_COD', title: t('codTitle'), desc: t('codDesc'), badge: 'CASH', color: 'var(--success)' })
    return arr
  }, [eligibility, t])
  const [paymentMode, setPaymentMode] = useState<PayMode>('FULL_COD')
  const [depositAmount, setDepositAmount] = useState(0)
  // Keep the selected mode valid + the deposit within bounds as the cart / eligibility changes.
  useEffect(() => {
    if (modes.length && !modes.some((m) => m.key === paymentMode)) setPaymentMode(modes[0]!.key)
  }, [modes, paymentMode])
  useEffect(() => {
    setDepositAmount((a) =>
      Math.min(Math.max(a || eligibility.depositMin, eligibility.depositMin), eligibility.depositMax),
    )
  }, [eligibility])

  const mutation = useMutation({
    mutationFn: (payload: CheckoutRequest) => checkout(slug, sessionToken as string, payload),
    onSuccess: (order) => {
      clearSession()
      const pay = order.payment
      // Unified pay page (Spec 09/10): one token page handles card (inline) + MoMo; a deposit link
      // carries the amount to pre-fill.
      if (pay?.mode === 'link' && pay.token) {
        const params = new URLSearchParams()
        if (pay.method) params.set('method', pay.method)
        if (pay.amount != null) params.set('amount', String(pay.amount))
        const q = params.toString()
        router.push(`${base}/pay/${pay.token}${q ? `?${q}` : ''}`)
        return
      }
      // COD / no online payment.
      router.push(`${base}/orders/${order.trackingToken}`)
    },
  })

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
    if (notDeliverable) next.area = t('errAreaUndeliverable')
    // Deposit must be at least the store's minimum — block, don't silently bump it up.
    if (paymentMode === 'DEPOSIT') {
      if (!(depositAmount >= eligibility.depositMin))
        next.deposit = t('depositTooLow', { min: formatMoney(eligibility.depositMin, currency) })
      else if (depositAmount > eligibility.depositMax)
        next.deposit = t('depositTooHigh', { total: formatMoney(eligibility.depositMax, currency) })
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (belowMin || !validate()) return
    // An online mode (full or deposit) needs a routable provider method so the server mints a link; the
    // pay page then offers all enabled methods. Full COD sends CASH.
    const online = paymentMode === 'FULL_ONLINE' || paymentMode === 'DEPOSIT'
    mutation.mutate({
      customerName: fullName.trim(),
      customerPhone: phone as string,
      customerEmail: email.trim() || undefined,
      fulfillmentType,
      deliveryCountry: isDelivery ? country || undefined : undefined,
      deliveryRegion: isDelivery ? region.trim() || undefined : undefined,
      deliveryAddress: isDelivery ? address.trim() : undefined,
      deliveryCity: isDelivery ? city.trim() || undefined : undefined,
      deliveryNotes: isDelivery && instructions.trim() ? instructions.trim() : undefined,
      paymentMode,
      depositAmount: paymentMode === 'DEPOSIT' ? depositAmount : undefined,
      paymentMethod: online ? (onlinePreferred ?? 'CASH') : 'CASH',
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
                  {arrangeDelivery
                    ? t('arrangeDeliveryShort')
                    : fee > 0
                      ? formatMoney(fee, currency)
                      : t('free')}
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
                <div className="field">
                  <label>{t('country')}</label>
                  <select
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value)
                      setRegion('')
                      setCity('')
                    }}
                  >
                    {(countriesQ.data ?? []).map((c) => (
                      <option key={c.iso2} value={c.iso2}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>{t('region')}</label>
                  <select
                    value={region}
                    disabled={!country}
                    onChange={(e) => {
                      setRegion(e.target.value)
                      setCity('')
                    }}
                  >
                    <option value="">{t('regionSelect')}</option>
                    {(regionsQ.data ?? []).map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field full">
                  <label>{t('city')}</label>
                  {(citiesQ.data ?? []).length > 0 ? (
                    <select value={city} onChange={(e) => setCity(e.target.value)}>
                      <option value="">{t('citySelect')}</option>
                      {(citiesQ.data ?? []).map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={city}
                      placeholder={t('cityPlaceholder')}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  )}
                </div>
                <div className="field full">
                  <label>{t('address')}</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} />
                  {errors.address ? (
                    <span style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4, display: 'block' }}>
                      {errors.address}
                    </span>
                  ) : null}
                </div>
                {notDeliverable ? (
                  <div className="field full">
                    <span style={{ color: 'var(--danger)', fontSize: 12.5 }}>
                      {t('errAreaUndeliverable')}
                    </span>
                  </div>
                ) : arrangeDelivery ? (
                  <div className="field full">
                    <span style={{ color: 'var(--brand)', fontSize: 12.5 }}>
                      {t('arrangeDeliveryHint')}
                    </span>
                  </div>
                ) : null}
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
            {modes.map((o) => (
              <div key={o.key}>
                <button
                  type="button"
                  className={`payopt${paymentMode === o.key ? ' on' : ''}`}
                  onClick={() => setPaymentMode(o.key)}
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
                {/* Deposit amount — shown when this mode is the selected deposit option. */}
                {o.key === 'DEPOSIT' && paymentMode === 'DEPOSIT' ? (
                  <div className="field" style={{ marginTop: 8 }}>
                    <label>
                      {t('depositAmountLabel', {
                        min: formatMoney(eligibility.depositMin, currency),
                        total: formatMoney(total, currency),
                      })}
                    </label>
                    <input
                      inputMode="decimal"
                      value={depositAmount ? String(depositAmount) : ''}
                      onChange={(e) => {
                        const v = Math.round(
                          Number(e.target.value.replace(/\s/g, '').replace(',', '.')) || 0,
                        )
                        setDepositAmount(v)
                        if (errors.deposit) setErrors((p) => ({ ...p, deposit: '' }))
                      }}
                    />
                    {errors.deposit ? (
                      <span
                        style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4, display: 'block' }}
                      >
                        {errors.deposit}
                      </span>
                    ) : (
                      <span
                        style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'block' }}
                      >
                        {t('depositRemainderHint', {
                          rest: formatMoney(Math.max(0, total - depositAmount), currency),
                        })}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {modes.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('noPaymentOption')}</p>
            ) : null}
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
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" />
                ) : null}
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
                {arrangeDelivery ? (
                  <span className="free">{t('arrangeDeliveryShort')}</span>
                ) : fee > 0 ? (
                  formatMoney(fee, currency)
                ) : (
                  <span className="free">{t('free')}</span>
                )}
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
          disabled={mutation.isPending || belowMin || notDeliverable}
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
