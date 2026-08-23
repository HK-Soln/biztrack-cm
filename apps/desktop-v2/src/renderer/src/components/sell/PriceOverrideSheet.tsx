import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { toWholeXaf } from '@biztrack/utils'
import { useT } from '@/i18n'
import { useCurrency } from '@/lib/currency'
import type { MessageKey } from '@/i18n/messages'

export interface PriceOverrideResult {
  unitPrice: number
  reasonCode: string | null
  reasonNote: string | null
}

interface Props {
  open: boolean
  /** Line being edited. `listed` is the catalogue price the discount is measured against. */
  line: { name: string; listed: number; unitPrice: number; quantity: number } | null
  onClose: () => void
  onConfirm: (result: PriceOverrideResult) => void
}

// Reason codes (BIZ-1.2). Store the code; labels are translated so history never rewrites.
const REASONS: Array<{ code: string; key: MessageKey }> = [
  { code: 'NEGOTIATED', key: 'reason.negotiated' },
  { code: 'REGULAR_CUSTOMER', key: 'reason.regular' },
  { code: 'BULK', key: 'reason.bulk' },
  { code: 'DAMAGED', key: 'reason.damaged' },
  { code: 'NEAR_EXPIRY', key: 'reason.nearExpiry' },
  { code: 'STAFF_PURCHASE', key: 'reason.staff' },
  { code: 'ROUNDING', key: 'reason.rounding' },
  { code: 'OTHER', key: 'reason.other' },
]

/**
 * Tap-a-price editor (BIZ-1.6): the OVERRIDE entry point. Pre-filled + selected numeric
 * field, live discount delta + resulting %, quick −5/−10% chips, and reason chips on the
 * same sheet (never a second screen). A price below the listed price becomes an OVERRIDE
 * discount downstream; at/above listed it is a plain price with no reason required.
 */
export function PriceOverrideSheet({ open, line, onClose, onConfirm }: Props) {
  const t = useT()
  const money = useCurrency()
  const [value, setValue] = useState('')
  const [reasonCode, setReasonCode] = useState<string | null>(null)
  const [reasonNote, setReasonNote] = useState('')

  useEffect(() => {
    if (open && line) {
      setValue(String(line.unitPrice))
      setReasonCode(null)
      setReasonNote('')
    }
  }, [open, line])

  const listed = line?.listed ?? 0
  const qty = line?.quantity ?? 1
  const price = useMemo(() => {
    const n = Number(value.replace(/[^0-9]/g, ''))
    return Number.isFinite(n) && n >= 0 ? toWholeXaf(n) : 0
  }, [value])

  const perUnitDelta = listed - price
  const lineDiscount = Math.max(0, perUnitDelta) * qty
  const discountPct = listed > 0 && perUnitDelta > 0 ? (perUnitDelta / listed) * 100 : 0
  const isDiscount = perUnitDelta > 0
  const needsReason = isDiscount
  const noteRequired = reasonCode === 'OTHER'
  const valid =
    price >= 0 && (!needsReason || (reasonCode !== null && (!noteRequired || reasonNote.trim())))

  const applyPct = (pct: number) => setValue(String(toWholeXaf(listed * (1 - pct / 100))))
  const reset = () => {
    setValue(String(listed))
    setReasonCode(null)
    setReasonNote('')
  }

  const confirm = () => {
    if (!valid) return
    onConfirm({
      unitPrice: price,
      reasonCode: isDiscount ? reasonCode : null,
      reasonNote: isDiscount && reasonCode === 'OTHER' ? reasonNote.trim() : null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('priceEdit.title')}
      onSubmit={confirm}
      footer={
        <>
          <Button variant="soft" type="button" onClick={onClose}>
            {t('priceEdit.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {t('priceEdit.apply')}
          </Button>
        </>
      }
    >
      {line ? (
        <>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>{line.name}</div>
          <div className="help" style={{ marginBottom: 12 }}>
            {t('priceEdit.listed')}: {money.format(listed)}
          </div>

          <label className="lbl2">{t('priceEdit.newPrice')}</label>
          <Input
            inputMode="numeric"
            value={value}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setValue(e.target.value)}
          />

          {/* live delta + resulting % */}
          <div style={{ marginTop: 8, fontSize: 13 }}>
            {isDiscount ? (
              <span style={{ color: 'var(--success)' }}>
                −{money.format(lineDiscount)} · {discountPct.toFixed(1)}%
              </span>
            ) : perUnitDelta < 0 ? (
              <span style={{ color: 'var(--danger)' }}>
                +{money.format(-perUnitDelta * qty)} ({t('priceEdit.markup')})
              </span>
            ) : (
              <span className="help">{t('priceEdit.noChange')}</span>
            )}
          </div>

          {/* quick chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" className="chip" onClick={() => applyPct(5)}>
              −5%
            </button>
            <button type="button" className="chip" onClick={() => applyPct(10)}>
              −10%
            </button>
            <button type="button" className="chip" onClick={reset}>
              {t('priceEdit.reset')}
            </button>
          </div>

          {/* reason chips — same sheet, only when it is actually a discount */}
          {needsReason ? (
            <div style={{ marginTop: 16 }}>
              <label className="lbl2">{t('priceEdit.reason')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {REASONS.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className={`chip${reasonCode === r.code ? ' on' : ''}`}
                    onClick={() => setReasonCode(r.code)}
                  >
                    {t(r.key)}
                  </button>
                ))}
              </div>
              {noteRequired ? (
                <div style={{ marginTop: 10 }}>
                  <Input
                    placeholder={t('priceEdit.notePh')}
                    value={reasonNote}
                    onChange={(e) => setReasonNote(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Modal>
  )
}
