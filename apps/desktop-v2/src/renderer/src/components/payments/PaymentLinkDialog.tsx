import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { Button, Modal } from '@biztrack/ui/biztrack'
import { minorToMajor } from '@biztrack/utils'
import type { CreatePaymentLinkRequest, PaymentLinkView } from '@shared/ipc'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'

/**
 * Spec 08 — create + share a payment link for a payable. Surface-agnostic: any merchant screen (a
 * debt, a sale, an online order, a deposit) opens this with the payable type + id. On open it creates
 * the link (or returns the existing live one) and shows the URL + QR + copy/WhatsApp share.
 */
export function PaymentLinkDialog({
  open,
  onClose,
  payable,
  title,
  customerPhone,
}: {
  open: boolean
  onClose: () => void
  payable: CreatePaymentLinkRequest
  title?: string
  /** Prefill the WhatsApp share to this number (the customer's), if known. */
  customerPhone?: string | null
}) {
  const t = useT()
  const money = useCurrency()
  const qc = useQueryClient()
  const [link, setLink] = useState<PaymentLinkView | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Live settlement (Spec 08/09): updated over the realtime channel while the QR is shown.
  const [settle, setSettle] = useState<{
    amountPaidMinor: number
    amountMinor: number
    done: boolean
  } | null>(null)
  const createdRef = useRef(false)

  // Subscribe to this link's settlements: show live "paid X of Y / ✓ paid" and refresh the offline-first
  // data behind the dialog (debts / deposit / sale) so it reflects the payment without a hard reload.
  useEffect(() => {
    if (!link) return
    const off = dataClient.payments.onLinkEvent((e) => {
      if (e.paymentLinkId !== link.id) return
      setSettle({ amountPaidMinor: e.amountPaidMinor, amountMinor: e.amountMinor, done: e.status === 'PAID' })
      // The payment was recorded on the SERVER; the offline-first screens read LOCAL data, so pull it
      // down first, THEN invalidate (a bare invalidate would refetch stale local data). On cloud,
      // sync.trigger is a no-op and queries hit the API directly, so the invalidate alone suffices.
      void Promise.resolve(dataClient.sync.trigger())
        .catch(() => undefined)
        .then(() => qc.invalidateQueries())
    })
    return off
  }, [link, qc])

  // Create once per open (or reuse the existing live link — the API is idempotent per payable).
  // Depend ONLY on `open`: `payable` is a fresh object each parent render, so keying the effect on it
  // would re-run on every re-render and its cleanup would discard the in-flight create (leaving the
  // dialog stuck on "creating"). The ref guards a single create; the dialog unmounts on close, so a
  // late setState is a harmless no-op.
  useEffect(() => {
    if (!open) {
      createdRef.current = false
      setLink(null)
      setQr(null)
      setError(null)
      setCopied(false)
      setSettle(null)
      return
    }
    if (createdRef.current) return
    createdRef.current = true
    void (async () => {
      try {
        const created = await dataClient.payments.createLink(payable)
        setLink(created)
        try {
          setQr(await QRCode.toDataURL(created.url, { width: 240, margin: 1 }))
        } catch {
          /* QR is a nicety; the copyable link still works */
        }
      } catch (e) {
        setError(errorMessage(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = link.url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareWhatsApp = () => {
    if (!link) return
    const digits = (customerPhone ?? '').replace(/\D/g, '')
    const text = encodeURIComponent(t('paymentLink.shareText').replace('{url}', link.url))
    const url = digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`
    window.open(url, '_blank')
  }

  return (
    <Modal open={open} onClose={onClose} title={title ?? t('paymentLink.title')}>
      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
      ) : !link ? (
        <p style={{ color: 'var(--text-2)', textAlign: 'center', padding: 20 }}>
          {t('paymentLink.creating')}
        </p>
      ) : (
        <div style={{ textAlign: 'center' }}>
          {settle ? (
            <div
              style={{
                margin: '0 0 12px',
                padding: '10px 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                color: settle.done ? 'var(--success, #1a7f45)' : '#b26b00',
                background: settle.done ? 'rgba(26,127,69,0.12)' : 'rgba(245,179,1,0.16)',
              }}
            >
              {settle.done
                ? t('paymentLink.livePaid')
                : t('paymentLink.livePartial')
                    .replace('{paid}', money.format(minorToMajor(settle.amountPaidMinor, link.currency)))
                    .replace('{total}', money.format(minorToMajor(settle.amountMinor, link.currency)))}
            </div>
          ) : null}
          {qr && !settle?.done ? (
            <img
              src={qr}
              alt=""
              width={200}
              height={200}
              style={{
                borderRadius: 12,
                border: '1px solid var(--line, rgba(0,0,0,0.08))',
                background: '#fff',
                padding: 8,
              }}
            />
          ) : null}
          <p style={{ color: 'var(--text-2)', fontSize: 12.5, marginTop: 12 }}>
            {t('paymentLink.shareHint')}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginTop: 10,
              padding: '8px 12px',
              border: '1px solid var(--line, rgba(0,0,0,0.14))',
              borderRadius: 10,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 12.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'left',
              }}
            >
              {link.url}
            </span>
            <Button variant="soft" onClick={copy}>
              {copied ? t('paymentLink.copied') : t('paymentLink.copy')}
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="soft" onClick={shareWhatsApp} style={{ flex: 1 }}>
              {t('paymentLink.shareWhatsApp')}
            </Button>
            <Button variant="primary" onClick={onClose} style={{ flex: 1 }}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
