'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import type { PublicOrderTracking, PublicStore, RealtimeOrderPaymentEvent } from '@biztrack/types'
import { formatMoney, getPaymentStatus, retryPayment } from '@/lib/api'
import { useOrderPaymentEvents } from '@/lib/use-order-payment'

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
const IcAlert = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 8v5" />
    <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
    <path d="M12 3 2 20h20L12 3Z" />
  </svg>
)

type Phase = 'idle' | 'pending' | 'paid' | 'failed'

// Provider failure-reason codes the API whitelists — each has localized copy under `payReason.*`.
// Anything else (or absent) falls back to the generic decline message.
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

// Stop auto-polling a still-PENDING request-to-pay after this long (the provider settles it to
// FAILED/EXPIRED well before this; the cap just avoids polling forever if it's stuck).
const POLL_WINDOW_MS = 180_000

/**
 * Our hosted payment page for self-handled providers (MoMo). The order is already placed; this page
 * starts + manages the payment inline — no redirects. A pending push is polled to a terminal state:
 * PAID shows a done state with a Continue button; FAILED explains what happened (with the provider's
 * reason when available) and lets the customer retry as many times as they like — while making clear
 * we already have their order and can follow up by phone.
 */
export function PaymentView({
  slug,
  base,
  trackingToken,
  order,
  store,
}: {
  slug: string
  base: string
  trackingToken: string
  order: PublicOrderTracking
  store: PublicStore | null
}) {
  const t = useTranslations('checkout')
  const router = useRouter()

  const currency = store?.currency ?? order.currency ?? 'XAF'
  const method = (order.paymentMethod ?? '').toUpperCase()
  const isMomo = method === 'MTN_MOMO' || method === 'ORANGE_MONEY'
  const amountLabel = formatMoney(order.totalAmount, currency)
  const orderHref = `${base}/orders/${trackingToken}`

  const [phase, setPhase] = useState<Phase>('idle')
  // Prefill with the number given at checkout; the customer can still change it (e.g. pay from another).
  const [phone, setPhone] = useState<string | undefined>(order.customerPhone ?? undefined)
  const [reason, setReason] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(0)

  const numberReady = !isMomo || isValidPhone(phone)

  // Start (or retry) the payment. Unlimited retries — a payment problem never blocks the order.
  const start = async () => {
    if (starting) return
    if (isMomo && !isValidPhone(phone)) {
      setError(t('errPhone'))
      return
    }
    setError(null)
    setReason(null)
    setStarting(true)
    setPhase('pending')
    try {
      const res = await retryPayment(slug, trackingToken, isMomo ? phone : undefined)
      if (res?.url) {
        window.location.href = res.url // hosted redirect (Stripe fallback)
        return
      }
      if (res?.pending) {
        startedRef.current = 0
        setPhase('pending')
        return
      }
      if (res?.failed) {
        setPhase('failed')
        return
      }
      setPhase('paid') // empty result = already paid
    } catch {
      setPhase('failed')
    } finally {
      setStarting(false)
    }
  }

  // Live settlement over WebSocket (primary transport) — active only while we're waiting. The poll
  // below is the fallback; both drive the same terminal state, so either one settling is enough.
  useOrderPaymentEvents(trackingToken, phase === 'pending', (payload: RealtimeOrderPaymentEvent) => {
    if (payload.status === 'PAID') setPhase('paid')
    else if (payload.status === 'FAILED') {
      setReason(payload.reason ?? null)
      setPhase('failed')
    }
  })

  // Poll while pending. Terminal → set the phase (capturing the provider reason on failure).
  useEffect(() => {
    if (phase !== 'pending') return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    if (!startedRef.current) startedRef.current = Date.now()
    const tick = async () => {
      const res = await getPaymentStatus(slug, trackingToken)
      if (!active) return
      if (res?.status === 'PAID') return setPhase('paid')
      if (res?.status === 'FAILED') {
        setReason(res.reason ?? null)
        return setPhase('failed')
      }
      if (Date.now() - startedRef.current < POLL_WINDOW_MS) timer = setTimeout(tick, 3000)
      else setPhase('failed') // stuck pending too long — let them retry
    }
    timer = setTimeout(tick, 2500)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [phase, slug, trackingToken])

  const reasonText =
    reason && KNOWN_REASONS.has(reason)
      ? t(`payReason.${reason}` as 'payReasonGeneric')
      : reason
        ? t('payReasonGeneric')
        : null

  // ---- Right-panel payment states ----------------------------------------

  const panel = (() => {
    if (phase === 'paid') {
      return (
        <div style={{ textAlign: 'center' }}>
          <div className="ei" style={{ color: 'var(--success)', margin: '0 auto 12px' }}>
            {IcCheck}
          </div>
          <h3 style={{ margin: 0 }}>{t('momoPaidTitle')}</h3>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>{t('paySuccessDesc')}</p>
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            style={{ marginTop: 18 }}
            onClick={() => router.push(`${orderHref}?paid=1`)}
          >
            {t('payContinue')}
          </button>
        </div>
      )
    }

    if (phase === 'pending') {
      return (
        <div style={{ textAlign: 'center' }}>
          <div className="ei" style={{ margin: '0 auto 12px' }}>
            {IcLock}
          </div>
          <h3 style={{ margin: 0 }}>{t('momoWaitTitle')}</h3>
          <p style={{ marginTop: 8 }}>{t('momoWaitDesc', { phone: phone ?? '' })}</p>
          <p style={{ marginTop: 10, color: 'var(--muted)' }}>{t('momoChecking')}</p>
          <button type="button" className="btn btn-lg btn-block" style={{ marginTop: 16 }} disabled>
            {t('payStarting')}
          </button>
        </div>
      )
    }

    // idle + failed share the number field + primary action.
    const failed = phase === 'failed'
    return (
      <div>
        {failed ? (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              background: 'var(--danger-soft, rgba(220,38,38,0.08))',
              color: 'var(--danger)',
              padding: '12px 14px',
              borderRadius: 12,
            }}
          >
            <span style={{ width: 20, height: 20, flex: '0 0 20px', marginTop: 1 }}>{IcAlert}</span>
            <div>
              <div style={{ fontWeight: 700 }}>{t('payFailedTitle')}</div>
              {reasonText ? (
                <div style={{ fontSize: 13, marginTop: 2 }}>{reasonText}</div>
              ) : null}
              <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text, inherit)' }}>
                {t('payFailedHelp')}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>{t('paySub')}</p>
        )}

        {isMomo ? (
          <div style={{ marginTop: 16, textAlign: 'left' }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {failed ? t('momoRetryPhoneLabel') : t('payNumberLabel')}
            </label>
            <PhoneInput value={phone} onChange={setPhone} defaultCountry="CM" error={!!error} />
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{t('payGuideMomo')}</p>
          </div>
        ) : null}

        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>
        ) : null}

        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          style={{ marginTop: 16 }}
          disabled={starting || !numberReady}
          onClick={start}
        >
          {IcLock}
          {failed ? t('momoRetry') : isMomo ? t('payNow', { amount: amountLabel }) : t('payCardCta')}
        </button>
      </div>
    )
  })()

  return (
    <div className="checkout">
      {/* left: order context */}
      <div>
        <div className="cocard">
          <h3 style={{ marginTop: 0 }}>{t('payTitle')}</h3>
          <div className="sumrow">
            <span>{t('orderLabelShort')}</span>
            <span className="v">#{order.orderNumber}</span>
          </div>
          <div className="sumrow">
            <span>{order.customerName}</span>
            <span className="v">{order.fulfillmentType === 'PICKUP' ? t('pickup') : t('delivery')}</span>
          </div>
          <div className="sum-grand" style={{ marginTop: 8 }}>
            <span className="l">{t('payAmount')}</span>
            <span className="g">{amountLabel}</span>
          </div>
        </div>
      </div>

      {/* right: payment panel */}
      <aside className="summary co-summary">{panel}</aside>
    </div>
  )
}
