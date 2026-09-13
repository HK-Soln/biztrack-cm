import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { PayableType, PaymentLinkStatus, type PaymentLinkView } from '@biztrack/types'
import { minorToMajor } from '@biztrack/utils'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { copyText } from '@/lib/clipboard'
import { useT } from '@/i18n'

const STATUS_STYLE: Record<PaymentLinkStatus, { color: string; bg: string }> = {
  [PaymentLinkStatus.ACTIVE]: { color: 'var(--brand)', bg: 'var(--brand-soft, rgba(59,130,246,0.12))' },
  [PaymentLinkStatus.PARTIALLY_PAID]: { color: '#b26b00', bg: 'rgba(245,179,1,0.16)' },
  [PaymentLinkStatus.PAID]: { color: 'var(--success, #1a7f45)', bg: 'rgba(26,127,69,0.12)' },
  [PaymentLinkStatus.EXPIRED]: { color: 'var(--text-2)', bg: 'rgba(0,0,0,0.06)' },
  [PaymentLinkStatus.CANCELLED]: { color: 'var(--text-2)', bg: 'rgba(0,0,0,0.06)' },
}

/**
 * Spec 08/09 — the business's payment links: status, amount collected so far, and the merchant actions
 * (copy, finalize-to-credit for a partially-paid sale/order, cancel). Lives in the Payments settings.
 */
export function PaymentLinksPanel() {
  const t = useT()
  const money = useCurrency()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: links, isLoading } = useQuery({
    queryKey: ['paymentLinks'],
    queryFn: () => dataClient.payments.listLinks(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['paymentLinks'] })
  const finalize = useMutation({
    mutationFn: (id: string) => dataClient.payments.finalizeLink(id),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e)),
  })
  const cancel = useMutation({
    mutationFn: (id: string) => dataClient.payments.cancelLink(id),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e)),
  })

  const fmt = (l: PaymentLinkView, minor: number) => money.format(minorToMajor(minor, l.currency))
  const copy = async (l: PaymentLinkView) => {
    if (!(await copyText(l.url))) return // only confirm when the copy actually landed
    setCopiedId(l.id)
    setTimeout(() => setCopiedId((c) => (c === l.id ? null : c)), 2000)
  }

  const active = (links ?? []).filter(
    (l) => l.status === PaymentLinkStatus.ACTIVE || l.status === PaymentLinkStatus.PARTIALLY_PAID,
  )

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-h">
        <div>
          <h3>{t('paymentLink.listTitle')}</h3>
          <p>{t('paymentLink.listSub')}</p>
        </div>
      </div>
      {error ? <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 16px' }}>{error}</p> : null}
      {isLoading ? (
        <p className="hint" style={{ padding: 16 }}>
          …
        </p>
      ) : active.length === 0 ? (
        <p className="hint" style={{ padding: 16 }}>
          {t('paymentLink.empty')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {active.map((l) => {
            const s = STATUS_STYLE[l.status]
            const canFinalize =
              l.status === PaymentLinkStatus.PARTIALLY_PAID &&
              (l.payableType === PayableType.SALE || l.payableType === PayableType.ONLINE_ORDER)
            const busy = finalize.isPending || cancel.isPending
            return (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '12px 16px',
                  borderTop: '1px solid var(--line, rgba(0,0,0,0.06))',
                }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>{l.label ?? l.payableType}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
                    {fmt(l, l.amountPaidMinor)} {t('paymentLink.paidOf')} {fmt(l, l.amountMinor)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: s.color,
                    background: s.bg,
                    padding: '4px 9px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t(`paymentLink.status.${l.status}` as 'paymentLink.status.ACTIVE')}
                </span>
                <Button variant="soft" onClick={() => copy(l)}>
                  {copiedId === l.id ? t('paymentLink.copied') : t('paymentLink.copy')}
                </Button>
                {canFinalize ? (
                  <Button
                    variant="soft"
                    disabled={busy}
                    onClick={() => {
                      setError(null)
                      finalize.mutate(l.id)
                    }}
                  >
                    {t('paymentLink.finalize')}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setError(null)
                    cancel.mutate(l.id)
                  }}
                >
                  {t('paymentLink.cancelLink')}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
