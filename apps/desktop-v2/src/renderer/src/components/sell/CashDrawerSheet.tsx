import { useCallback, useEffect, useState } from 'react'
import { Button, Modal } from '@biztrack/ui/biztrack'
import {
  CashMovementKind,
  type CashMovement,
  type CashSession,
  type CashSessionExpectedCash,
} from '@biztrack/types'
import { formatCurrency } from '@biztrack/utils'
import { useT } from '@/i18n'

/**
 * POS cash-drawer sheet (BIZ-2.3) — reachable in two taps from the Sell screen. Open a
 * shift with a float, record off-book cash movements (owner draw, drop, change, supplier
 * payment) so the drawer reconciles, and see the live expected cash. Desktop-only (the
 * till lives on the device); uses window.api directly. Closing the shift is BIZ-2.4;
 * the EXPENSE→P&L bridge is the remaining BIZ-2.3 piece.
 */

const MOVEMENT_KINDS: CashMovementKind[] = [
  CashMovementKind.OWNER_DRAW,
  CashMovementKind.DROP,
  CashMovementKind.CHANGE_IN,
  CashMovementKind.CHANGE_OUT,
  CashMovementKind.SUPPLIER_PAYMENT,
]

export function CashDrawerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<CashSession | null>(null)
  const [expected, setExpected] = useState<CashSessionExpectedCash | null>(null)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Open-shift form
  const [floatInput, setFloatInput] = useState('')
  // Movement form
  const [kind, setKind] = useState<CashMovementKind>(CashMovementKind.OWNER_DRAW)
  const [amountInput, setAmountInput] = useState('')
  const [note, setNote] = useState('')

  const api = typeof window !== 'undefined' ? window.api?.cashSessions : undefined

  const refresh = useCallback(async () => {
    if (!api) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const current = await api.current()
      setSession(current)
      if (current) {
        const [exp, moves] = await Promise.all([
          api.expectedCash(current.id),
          api.listMovements(current.id),
        ])
        setExpected(exp)
        setMovements(moves)
      } else {
        setExpected(null)
        setMovements([])
      }
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (open) {
      setError(null)
      void refresh()
    }
  }, [open, refresh])

  const openShift = async () => {
    if (!api || busy) return
    const openingFloat = Math.round(Number(floatInput) || 0)
    if (openingFloat < 0) return
    setBusy(true)
    setError(null)
    try {
      await api.open({ openingFloat })
      setFloatInput('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const record = async () => {
    if (!api || busy) return
    const amount = Math.round(Number(amountInput) || 0)
    if (amount <= 0) {
      setError(t('cash.amountRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.recordMovement({ kind, amount, note: note.trim() || undefined })
      setAmountInput('')
      setNote('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const kindLabel = (k: CashMovementKind): string => t(`cash.kind.${k}`)

  return (
    <Modal open={open} onClose={onClose} title={t('cash.title')}>
      {loading ? (
        <p className="cash-muted">{t('cash.loading')}</p>
      ) : !api ? (
        <p className="cash-muted">{t('cash.desktopOnly')}</p>
      ) : !session ? (
        <div className="cash-open">
          <p style={{ marginBottom: 12 }}>{t('cash.noShift')}</p>
          <label className="lbl2">{t('cash.openingFloat')}</label>
          <input
            className="cash-in"
            type="number"
            min={0}
            inputMode="numeric"
            value={floatInput}
            onChange={(e) => setFloatInput(e.target.value)}
            placeholder="0"
          />
          {error ? (
            <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
              {error}
            </p>
          ) : null}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={() => void openShift()} loading={busy}>
              {t('cash.openShift')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="cash-shift">
          {expected ? (
            <div className="cash-expected">
              <div className="ce-row">
                <span>{t('cash.openingFloat')}</span>
                <span>{formatCurrency(expected.openingFloat)}</span>
              </div>
              <div className="ce-row">
                <span>{t('cash.cashSales')}</span>
                <span>+ {formatCurrency(expected.cashPayments)}</span>
              </div>
              {expected.changeGiven > 0 ? (
                <div className="ce-row">
                  <span>{t('cash.changeGiven')}</span>
                  <span>− {formatCurrency(expected.changeGiven)}</span>
                </div>
              ) : null}
              {expected.cashIn > 0 ? (
                <div className="ce-row">
                  <span>{t('cash.cashIn')}</span>
                  <span>+ {formatCurrency(expected.cashIn)}</span>
                </div>
              ) : null}
              {expected.cashOut > 0 ? (
                <div className="ce-row">
                  <span>{t('cash.cashOut')}</span>
                  <span>− {formatCurrency(expected.cashOut)}</span>
                </div>
              ) : null}
              <div className="ce-row grand">
                <span>{t('cash.expectedCash')}</span>
                <span>{formatCurrency(expected.expectedCash)}</span>
              </div>
            </div>
          ) : null}

          <div className="cash-record">
            <label className="lbl2">{t('cash.recordMovement')}</label>
            <div className="chips">
              {MOVEMENT_KINDS.map((k) => (
                <button
                  type="button"
                  key={k}
                  className={`chip${kind === k ? ' on' : ''}`}
                  onClick={() => setKind(k)}
                >
                  {kindLabel(k)}
                </button>
              ))}
            </div>
            <input
              className="cash-in"
              type="number"
              min={1}
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder={t('cash.amount')}
              style={{ marginTop: 10 }}
            />
            <input
              className="cash-in"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('cash.notePlaceholder')}
              style={{ marginTop: 8 }}
            />
            {error ? (
              <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
                {error}
              </p>
            ) : null}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={() => void record()} loading={busy}>
                {t('cash.record')}
              </Button>
            </div>
          </div>

          {movements.length > 0 ? (
            <div className="cash-moves">
              <label className="lbl2">{t('cash.recent')}</label>
              {movements.slice(0, 8).map((m) => (
                <div className="cm-row" key={m.id}>
                  <span className="cm-kind">{kindLabel(m.kind as CashMovementKind)}</span>
                  {m.note ? <span className="cm-note">{m.note}</span> : null}
                  <span className={`cm-amt ${m.direction === 'IN' ? 'in' : 'out'}`}>
                    {m.direction === 'IN' ? '+' : '−'} {formatCurrency(m.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
