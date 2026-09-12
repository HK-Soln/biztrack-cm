'use client'

import { cloneElement, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { useTranslations } from 'next-intl'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import type { PublicPaymentLink } from '@biztrack/types'
import { formatMoney, getLinkPaymentStatus, getPaymentLink, initiateLinkPayment } from '@/lib/api'

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

function Badge({ icon, tone }: { icon: ReactElement; tone: 'brand' | 'success' | 'danger' }) {
  const color =
    tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--brand)'
  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 16,
        margin: '0 auto 14px',
        display: 'grid',
        placeItems: 'center',
        color,
        background: 'var(--brand-soft, rgba(0,0,0,0.05))',
      }}
    >
      {cloneElement(icon as ReactElement<{ style?: CSSProperties }>, {
        style: { width: 24, height: 24 },
      })}
    </div>
  )
}

const KNOWN_REASONS = new Set([
  'NOT_ENOUGH_FUNDS',
  'PAYER_LIMIT_REACHED',
  'APPROVAL_REJECTED',
  'PAYMENT_NOT_APPROVED',
  'EXPIRED',
  'TRANSACTION_CANCELED',
  'PAYER_NOT_FOUND',
  'PAYEE_NOT_ALLOWED_TO_RECEIVE',
  'INTERNAL_PROCESSING_ERROR',
])

const METHOD_META: Record<string, { badge: string; color: string }> = {
  CARD: { badge: 'CARD', color: '#635bff' },
  MTN_MOMO: { badge: 'MTN', color: '#f5b301' },
  ORANGE_MONEY: { badge: 'OM', color: '#ff6a00' },
}

const POLL_WINDOW_MS = 180_000

type Phase = 'idle' | 'card' | 'pending' | 'paid' | 'failed'

/**
 * Spec 08 — the public payment-link pay page. Generalizes the storefront order PaymentView for an
 * arbitrary payable: pick a method, (for a partial-capable link) an amount capped at the balance, then
 * card → hosted redirect, MoMo → number → push → poll. The amount is re-validated server-side.
 */
export function PayLinkView({
  token,
  link: initialLink,
  preferredMethod,
}: {
  token: string
  link: PublicPaymentLink
  preferredMethod?: string
}) {
  const t = useTranslations('pay')

  // The link is re-fetched after each payment settles, so a PARTIAL payment updates the live balance
  // and the payer can pay again toward the limit (split payments). `link` is therefore state.
  const [link, setLink] = useState<PublicPaymentLink>(initialLink)
  // A partial payment just landed → show "X received, Y remaining" above the form.
  const [partialPaidMinor, setPartialPaidMinor] = useState(0)

  const currency = link.currency
  const dueMajor = link.amountDueMinor // XAF exponent 0 — minor == major
  const isOpen = link.amountDueMinor <= 0 && link.allowPartial // deposit top-up: payer enters amount

  const [phase, setPhase] = useState<Phase>('idle')
  const [method, setMethod] = useState<string>(
    preferredMethod && link.methods.includes(preferredMethod)
      ? preferredMethod
      : (link.methods[0] ?? ''),
  )
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [amount, setAmount] = useState<number>(isOpen ? 0 : dueMajor)
  const [reason, setReason] = useState<string | null>(null)
  // Online-order checkout: once paid, count down and auto-forward to the order tracking page.
  const [redirectIn, setRedirectIn] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Embedded card (Stripe Elements): set when initiate returns kind==='elements'.
  const [elementsData, setElementsData] = useState<{
    clientSecret: string
    publishableKey: string
  } | null>(null)
  const startedRef = useRef(0)

  const isMomo = method === 'MTN_MOMO' || method === 'ORANGE_MONEY'
  const terminalLink =
    link.status === 'PAID' || link.status === 'EXPIRED' || link.status === 'CANCELLED'
  const amountReady = isOpen || link.allowPartial ? amount > 0 : dueMajor > 0

  /** A payment attempt settled: re-fetch the link. If fully paid (or a one-shot deposit) → done; else a
   *  PARTIAL payment landed and a balance remains → back to the form for another payment (split pay). */
  const onAttemptSettled = async () => {
    const fresh = await getPaymentLink(token)
    if (!fresh || fresh.status === 'PAID' || (!fresh.allowPartial && phase === 'pending')) {
      if (fresh) setLink(fresh)
      return setPhase('paid')
    }
    if (fresh.amountDueMinor <= 0) {
      setLink(fresh)
      return setPhase('paid')
    }
    // Balance remains → offer to pay the rest.
    setPartialPaidMinor(Number(fresh.amountPaidMinor) || 0)
    setLink(fresh)
    setAmount(fresh.amountDueMinor)
    setPhone(undefined)
    setPhase('idle')
  }

  const start = async () => {
    if (starting) return
    if (isMomo && !isValidPhone(phone)) return setError(t('errPhone'))
    setError(null)
    setReason(null)
    setStarting(true)
    if (isMomo) setPhase('pending') // MoMo → show the "approve on your phone" screen while the push starts
    try {
      const res = await initiateLinkPayment(token, {
        method,
        clientReference: crypto.randomUUID(),
        amountMinor: isOpen || link.allowPartial ? Math.round(amount) : undefined,
        customerPhone: isMomo ? phone : undefined,
        returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      })
      if (res?.kind === 'elements' && res.clientSecret && res.publishableKey) {
        setElementsData({ clientSecret: res.clientSecret, publishableKey: res.publishableKey })
        setPhase('card') // mount Stripe Elements inline
        return
      }
      if (res?.url) {
        window.location.href = res.url // hosted redirect (card fallback)
        return
      }
      if (res?.kind === 'pending') {
        startedRef.current = 0
        setPhase('pending')
        return
      }
      setPhase('paid')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('genericError'))
      setPhase('failed')
    } finally {
      setStarting(false)
    }
  }

  /** The Stripe Element confirmed the payment client-side → move to the poll, which settles the attempt
   *  (via webhook/poll) and advances the link. */
  const onCardConfirmed = () => {
    setElementsData(null)
    startedRef.current = 0
    setPhase('pending')
  }

  // Poll while pending.
  useEffect(() => {
    if (phase !== 'pending') return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    if (!startedRef.current) startedRef.current = Date.now()
    const tick = async () => {
      const res = await getLinkPaymentStatus(token)
      if (!active) return
      if (res?.status === 'PAID') return void onAttemptSettled()
      if (res?.status === 'FAILED') {
        setReason(res.reason ?? null)
        return setPhase('failed')
      }
      if (Date.now() - startedRef.current < POLL_WINDOW_MS) timer = setTimeout(tick, 3000)
      else setPhase('failed')
    }
    timer = setTimeout(tick, 2500)
    return () => {
      active = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, token])

  // Online-order checkout only: after a successful payment, auto-redirect to the order tracking page
  // (the pay page runs on the store's own origin, so a relative /orders/{token} is correct). Any
  // interaction is preserved by also offering an explicit "continue" button below.
  const continueUrl = link.orderTrackingToken ? `/orders/${link.orderTrackingToken}` : null
  useEffect(() => {
    if (phase !== 'paid' || !continueUrl) return
    setRedirectIn(5)
    const iv = setInterval(() => {
      setRedirectIn((n) => {
        if (n === null) return n
        if (n <= 1) {
          clearInterval(iv)
          window.location.href = continueUrl
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [phase, continueUrl])

  const reasonText =
    reason && KNOWN_REASONS.has(reason)
      ? t(`reason.${reason}` as 'reasonGeneric')
      : reason
        ? t('reasonGeneric')
        : null

  // Stripe-style merchant header: logo (or an initial avatar) + business name, shown on every state so
  // the payer always sees who they are paying.
  const header = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
      }}
    >
      {link.businessLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={link.businessLogoUrl}
          alt=""
          style={{
            width: 56,
            height: 56,
            borderRadius: 15,
            objectFit: 'cover',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          }}
        />
      ) : (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 15,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--brand)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 23,
          }}
        >
          {(link.businessName || 'P').slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ fontSize: 16, fontWeight: 700 }}>{link.businessName}</div>
    </div>
  )

  const card = (children: React.ReactNode) => (
    <div
      style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--line, rgba(0,0,0,0.08))',
        borderRadius: 16,
        padding: 24,
        textAlign: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.12)',
      }}
    >
      {header}
      {children}
    </div>
  )

  // ---- Terminal link (already paid / expired / cancelled) -----------------
  if (terminalLink && phase !== 'paid') {
    const paid = link.status === 'PAID'
    return card(
      <>
        <Badge icon={paid ? IcCheck : IcLock} tone={paid ? 'success' : 'danger'} />
        <h2 style={{ margin: 0 }}>{paid ? t('linkPaidTitle') : t('linkInactiveTitle')}</h2>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>
          {paid ? t('linkPaidDesc') : t('linkInactiveDesc')}
        </p>
      </>,
    )
  }

  // ---- Embedded card (Stripe Elements) ------------------------------------
  if (phase === 'card' && elementsData) {
    return card(
      <div style={{ textAlign: 'left' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 800 }}>
            {formatMoney(isOpen || link.allowPartial ? amount : dueMajor, currency)}
          </div>
        </div>
        <StripeCardForm
          clientSecret={elementsData.clientSecret}
          publishableKey={elementsData.publishableKey}
          payLabel={t('payNow', {
            amount: formatMoney(isOpen || link.allowPartial ? amount : dueMajor, currency),
          })}
          processingLabel={t('starting')}
          cancelLabel={t('cancel')}
          genericError={t('genericError')}
          onConfirmed={onCardConfirmed}
          onCancel={() => {
            setElementsData(null)
            setPhase('idle')
          }}
        />
      </div>,
    )
  }

  // ---- Terminal payment states --------------------------------------------
  if (phase === 'paid') {
    return card(
      <>
        <Badge icon={IcCheck} tone="success" />
        <h2 style={{ margin: 0 }}>{t('paidTitle')}</h2>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>
          {t('paidDesc', { business: link.businessName })}
        </p>
        {continueUrl ? (
          <div style={{ marginTop: 20 }}>
            <a href={continueUrl} className="btn btn-primary btn-lg btn-block">
              {t('continueToOrder')}
            </a>
            {redirectIn != null && redirectIn > 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>
                {t('redirectingIn', { seconds: redirectIn })}
              </p>
            ) : null}
          </div>
        ) : null}
      </>,
    )
  }

  if (phase === 'pending') {
    return card(
      <>
        <Badge icon={IcLock} tone="brand" />
        <h2 style={{ margin: 0 }}>{t('waitTitle')}</h2>
        <p style={{ marginTop: 8 }}>{t('waitDesc', { phone: phone ?? '' })}</p>
        <p style={{ marginTop: 10, color: 'var(--muted)' }}>{t('waitChecking')}</p>
      </>,
    )
  }

  // ---- idle / failed: the pay form ----------------------------------------
  const failed = phase === 'failed'
  const noMethods = link.methods.length === 0
  return card(
    <div style={{ textAlign: 'left' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>{link.label}</div>
        {!isOpen ? (
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>
            {formatMoney(dueMajor, currency)}
          </div>
        ) : null}
        {!isOpen && partialPaidMinor > 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
            {t('remainingOf', { paid: formatMoney(partialPaidMinor, currency) })}
          </div>
        ) : null}
      </div>

      {partialPaidMinor > 0 && !failed ? (
        <div
          style={{
            background: 'var(--success-soft, rgba(26,127,69,0.1))',
            color: 'var(--success)',
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {t('partialReceived')}
        </div>
      ) : null}

      {failed ? (
        <div
          style={{
            background: 'var(--danger-soft, rgba(220,38,38,0.08))',
            color: 'var(--danger)',
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          <b>{t('failedTitle')}</b>
          {reasonText ? <div style={{ marginTop: 2 }}>{reasonText}</div> : null}
        </div>
      ) : null}

      {noMethods ? (
        <p style={{ color: 'var(--muted)', textAlign: 'center' }}>{t('noMethods')}</p>
      ) : (
        <>
          {isOpen || link.allowPartial ? (
            <div className="field" style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                {isOpen ? t('amountLabel') : t('amountPartialLabel')}
              </label>
              <input
                inputMode="decimal"
                value={amount ? String(amount) : ''}
                placeholder="0"
                style={{ width: '100%' }}
                onChange={(e) => {
                  let v = Number(e.target.value.replace(/\s/g, '').replace(',', '.')) || 0
                  if (!isOpen && v > dueMajor) v = dueMajor // cap at the balance (server also caps)
                  setAmount(v)
                }}
              />
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {link.methods.map((m) => {
              const meta = METHOD_META[m] ?? { badge: m.slice(0, 2), color: 'var(--brand)' }
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    border: `1px solid ${method === m ? 'var(--brand)' : 'var(--line, rgba(0,0,0,0.12))'}`,
                    borderRadius: 12,
                    background: method === m ? 'var(--brand-soft, rgba(0,0,0,0.03))' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      background: meta.color,
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: 7,
                    }}
                  >
                    {meta.badge}
                  </span>
                  <span style={{ fontWeight: 600 }}>{t(`method.${m}` as 'method.CARD')}</span>
                </button>
              )
            })}
          </div>

          {isMomo ? (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                {t('momoNumberLabel')}
              </label>
              <PhoneInput value={phone} onChange={setPhone} defaultCountry="CM" error={!!error} />
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{t('momoHint')}</p>
            </div>
          ) : null}

          {error ? (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</p>
          ) : null}

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            disabled={starting || !method || !amountReady}
            onClick={start}
          >
            {IcLock}
            {starting
              ? t('starting')
              : isMomo
                ? t('payNow', { amount: formatMoney(isOpen || link.allowPartial ? amount : dueMajor, currency) })
                : t('payByCard')}
          </button>
        </>
      )}
    </div>,
  )
}

/**
 * Inline Stripe card form (Elements). Mounts a PaymentElement against the PaymentIntent's clientSecret
 * and confirms it client-side (redirect: 'if_required' — the merchant's Stripe key decides whether a
 * 3-D Secure step is needed). On success the parent moves to the poll, which settles the attempt.
 */
function StripeCardForm({
  clientSecret,
  publishableKey,
  payLabel,
  processingLabel,
  cancelLabel,
  genericError,
  onConfirmed,
  onCancel,
}: {
  clientSecret: string
  publishableKey: string
  payLabel: string
  processingLabel: string
  cancelLabel: string
  genericError: string
  onConfirmed: () => void
  onCancel: () => void
}) {
  // loadStripe returns a stable promise; create it once per key.
  const [stripePromise] = useState(() => loadStripe(publishableKey))
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CardInner
        payLabel={payLabel}
        processingLabel={processingLabel}
        cancelLabel={cancelLabel}
        genericError={genericError}
        onConfirmed={onConfirmed}
        onCancel={onCancel}
      />
    </Elements>
  )
}

function CardInner({
  payLabel,
  processingLabel,
  cancelLabel,
  genericError,
  onConfirmed,
  onCancel,
}: {
  payLabel: string
  processingLabel: string
  cancelLabel: string
  genericError: string
  onConfirmed: () => void
  onCancel: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!stripe || !elements || submitting) return
    setErr(null)
    setSubmitting(true)
    const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (error) {
      setErr(error.message ?? genericError)
      setSubmitting(false)
      return
    }
    onConfirmed()
  }

  return (
    <>
      <PaymentElement />
      {err ? <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p> : null}
      <button
        type="button"
        className="btn btn-primary btn-lg btn-block"
        style={{ marginTop: 14 }}
        disabled={!stripe || submitting}
        onClick={submit}
      >
        {submitting ? processingLabel : payLabel}
      </button>
      <button
        type="button"
        className="btn btn-block"
        style={{ marginTop: 8 }}
        disabled={submitting}
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
    </>
  )
}
