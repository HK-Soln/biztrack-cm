import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Button, Modal } from '@biztrack/ui/biztrack'
import type { CreatePaymentLinkRequest, PaymentLinkView } from '@shared/ipc'
import { dataClient } from '@/lib/data-client'
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
  const [link, setLink] = useState<PaymentLinkView | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const createdRef = useRef(false)

  // Create once per open (or reuse the existing live link — the API is idempotent per payable).
  useEffect(() => {
    if (!open) {
      createdRef.current = false
      setLink(null)
      setQr(null)
      setError(null)
      setCopied(false)
      return
    }
    if (createdRef.current) return
    createdRef.current = true
    let active = true
    void (async () => {
      try {
        const created = await dataClient.payments.createLink(payable)
        if (!active) return
        setLink(created)
        try {
          setQr(await QRCode.toDataURL(created.url, { width: 240, margin: 1 }))
        } catch {
          /* QR is a nicety; the copyable link still works */
        }
      } catch (e) {
        if (active) setError(errorMessage(e))
      }
    })()
    return () => {
      active = false
    }
  }, [open, payable])

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
          {qr ? (
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
