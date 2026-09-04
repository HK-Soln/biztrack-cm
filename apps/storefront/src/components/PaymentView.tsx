'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import type { PublicOrderTracking, PublicStore } from '@biztrack/types'
import { formatMoney, getPaymentStatus, retryPayment } from '@/lib/api'

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

type Phase = 'idle' | 'polling' | 'paid' | 'failed' | 'final'

/**
 * Storefront payment page for self-handled providers (MoMo). The order is already placed; here we
 * start the provider payment (POST .../pay), then poll (GET .../payment) to a terminal state. On a
 * failure the customer can retry — optionally from a different Mobile Money number — up to MAX_RETRIES,
 * after which we hand off ("we'll call you"). A hosted-provider fallback (a Stripe link) simply
 * redirects. Payment problems here never affect the (already-created) order.
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

  const MAX_RETRIES = 2
  const [phase, setPhase] = useState<Phase>('idle')
  // Prefill with the number given at checkout; the customer can still change it (e.g. pay from another).
  const [phone, setPhone] = useState<string | undefined>(order.customerPhone ?? undefined)
  const [retries, setRetries] = useState(0)
  const [starting, setStarting] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(0)

  // Start (or retry) the payment. A retry is any start made from the failed screen — it counts toward
  // MAX_RETRIES and, once exhausted, moves to the final ("we'll call you") screen.
  const start = async () => {
    if (starting) return
    if (isMomo && !isValidPhone(phone)) {
      setError(t('errPhone'))
      return
    }
    const isRetry = phase === 'failed'
    const nextRetries = isRetry ? retries + 1 : retries
    setError(null)
    setStarting(true)
    try {
      const res = await retryPayment(slug, trackingToken, isMomo ? phone : undefined)
      if (isRetry) setRetries(nextRetries)
      if (res?.url) {
        window.location.href = res.url // hosted redirect (Stripe fallback)
        return
      }
      if (res?.pending) {
        startedRef.current = 0
        setPhase('polling')
        return
      }
      if (res?.failed) {
        setPhase(nextRetries >= MAX_RETRIES ? 'final' : 'failed')
        return
      }
      router.push(`${orderHref}?paid=1`) // empty result = already paid
    } catch {
      if (isRetry) setRetries(nextRetries)
      setPhase(nextRetries >= MAX_RETRIES ? 'final' : 'failed')
    } finally {
      setStarting(false)
    }
  }

  // Poll while pending. Terminal → set the phase; still pending after ~2 min → hand off to the order page.
  useEffect(() => {
    if (phase !== 'polling') return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    if (!startedRef.current) startedRef.current = Date.now()
    const tick = async () => {
      const res = await getPaymentStatus(slug, trackingToken)
      if (!active) return
      if (res?.status === 'PAID') return setPhase('paid')
      if (res?.status === 'FAILED') return setPhase(retries >= MAX_RETRIES ? 'final' : 'failed')
      if (Date.now() - startedRef.current < 120_000) timer = setTimeout(tick, 3000)
      else router.push(orderHref)
    }
    timer = setTimeout(tick, 2500)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [phase, retries, slug, trackingToken, orderHref, router])

  // On a terminal phase, count down 10s then go to the order page.
  useEffect(() => {
    if (phase !== 'paid' && phase !== 'final') return
    setCountdown(10)
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id)
          router.push(`${orderHref}${phase === 'paid' ? '?paid=1' : '?payment=failed'}`)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase, orderHref, router])

  if (phase === 'paid' || phase === 'final') {
    const paid = phase === 'paid'
    return (
      <div className="empty" style={{ maxWidth: 480 }}>
        <div className="ei" style={{ color: paid ? 'var(--success)' : 'var(--danger)' }}>
          {paid ? IcCheck : IcLock}
        </div>
        <h3>{paid ? t('momoPaidTitle') : t('momoFinalTitle')}</h3>
        <p>{paid ? t('momoPaidDesc') : t('momoFinalDesc')}</p>
        <p style={{ marginTop: 10, color: 'var(--muted)' }}>{t('momoRedirectIn', { n: countdown })}</p>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          style={{ marginTop: 18 }}
          onClick={() => router.push(`${orderHref}${paid ? '?paid=1' : '?payment=failed'}`)}
        >
          {t('momoContinueNow')}
        </button>
      </div>
    )
  }

  if (phase === 'polling') {
    return (
      <div className="empty" style={{ maxWidth: 480 }}>
        <div className="ei">{IcLock}</div>
        <h3>{t('momoWaitTitle')}</h3>
        <p>{t('momoWaitDesc', { phone: phone ?? '' })}</p>
        <p style={{ marginTop: 10, color: 'var(--muted)' }}>{t('momoChecking')}</p>
      </div>
    )
  }

  // idle + failed share the amount + (MoMo number) + pay/retry form.
  const failed = phase === 'failed'
  return (
    <div className="empty" style={{ maxWidth: 460 }}>
      <div className="ei" style={{ color: failed ? 'var(--danger)' : undefined }}>
        {IcLock}
      </div>
      <h3>{failed ? t('momoFailedTitle') : t('payTitle')}</h3>
      <p>{failed ? t('momoFailed') : t('paySub')}</p>

      <div
        style={{
          margin: '18px 0',
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--brand-soft, rgba(0,0,0,0.04))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('payAmount')}</span>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{amountLabel}</span>
      </div>

      {isMomo ? (
        <div style={{ textAlign: 'left' }}>
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
        disabled={starting}
        onClick={start}
      >
        {IcLock}
        {starting
          ? t('payStarting')
          : failed
            ? t('momoRetry')
            : isMomo
              ? t('payNow', { amount: amountLabel })
              : t('payCardCta')}
      </button>
    </div>
  )
}
