import { Button, Modal } from '@biztrack/ui/biztrack'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'

/**
 * Spec 09 v2 — before handing the customer a pay-online QR, ask HOW MUCH they'll pay online. Full amount
 * → a plain card/MoMo sale (no customer needed). Less than the total → the remainder is recorded as a
 * credit sale, so a customer is required (the receivable needs an owner). The sale itself is created only
 * once the online amount is collected (SALE_DRAFT).
 */
export function PayOnlineAmountDialog({
  open,
  total,
  amount,
  onAmountChange,
  customerName,
  onPickCustomer,
  onClose,
  onConfirm,
}: {
  open: boolean
  /** The cart total in major units. */
  total: number
  /** The online amount (major units) — controlled by the parent so it survives a customer-pick. */
  amount: number
  onAmountChange: (amount: number) => void
  customerName: string | null
  onPickCustomer: () => void
  onClose: () => void
  onConfirm: (amount: number) => void
}) {
  const t = useT()
  const money = useCurrency()

  const partial = amount > 0 && amount < total
  const needsCustomer = partial && !customerName
  const valid = amount > 0 && amount <= total && !needsCustomer

  return (
    <Modal open={open} onClose={onClose} title={t('sell.payOnline')}>
      <div className="pm-field">
        <div className="pm-lbl">{t('sell.payOnlineAmount')}</div>
        <input
          className="input"
          inputMode="decimal"
          autoFocus
          value={amount ? String(amount) : ''}
          placeholder="0"
          onChange={(e) => {
            let v = Number(e.target.value.replace(/\s/g, '').replace(',', '.')) || 0
            if (v > total) v = total
            onAmountChange(v)
          }}
        />
        <div className="pm-note" style={{ marginTop: 8 }}>
          <span>{t('sell.payOnlineTotal').replace('{total}', money.format(total))}</span>
        </div>
      </div>

      {partial ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 13,
            color: '#b26b00',
            background: 'rgba(245,179,1,0.14)',
          }}
        >
          {t('sell.payOnlineCreditNote').replace('{credit}', money.format(total - amount))}
        </div>
      ) : null}

      {partial ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 13 }}>
            {customerName ? (
              <b>{customerName}</b>
            ) : (
              <span style={{ color: 'var(--danger)' }}>{t('sell.payOnlineNeedsCustomer')}</span>
            )}
          </div>
          <Button variant="soft" onClick={onPickCustomer}>
            {t('sell.selectCustomer')}
          </Button>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <Button
          variant="primary"
          className="btn-block"
          disabled={!valid}
          onClick={() => onConfirm(amount)}
        >
          {t('sell.payOnlineGenerate').replace('{amount}', money.format(amount))}
        </Button>
      </div>
    </Modal>
  )
}
