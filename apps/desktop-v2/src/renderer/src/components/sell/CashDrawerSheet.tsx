import { useCallback, useEffect, useState } from 'react'
import { Button, Modal } from '@biztrack/ui/biztrack'
import {
  CASH_DENOMINATIONS,
  CashMovementKind,
  type CashMovement,
  type CashSession,
  type CashSessionExpectedCash,
} from '@biztrack/types'
import { formatCurrency } from '@biztrack/utils'
import { useT } from '@/i18n'

/**
 * Cash-drawer sheet (BIZ-2.3 / 2.4), opened from the nav shift chip. Open a shift with a
 * float, record off-book cash movements (owner draw, drop, change, supplier payment) so
 * the drawer reconciles, see the live expected cash, and close with a blind denomination
 * count that reveals the variance. Desktop-only (the till lives on the device).
 */

const MOVEMENT_KINDS: CashMovementKind[] = [
  CashMovementKind.OWNER_DRAW,
  CashMovementKind.DROP,
  CashMovementKind.CHANGE_IN,
  CashMovementKind.CHANGE_OUT,
  CashMovementKind.SUPPLIER_PAYMENT,
]

type Mode = 'operate' | 'count' | 'result'

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
  // Close flow
  const [mode, setMode] = useState<Mode>('operate')
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [closed, setClosed] = useState<CashSession | null>(null)

  const api = typeof window !== 'undefined' ? window.api?.cashSessions : undefined

  const countedTotal = CASH_DENOMINATIONS.reduce(
    (sum, d) => sum + d * Math.max(0, Math.floor(Number(counts[d]) || 0)),
    0,
  )

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
      setMode('operate')
      setCounts({})
      setClosed(null)
      void refresh()
    }
  }, [open, refresh])

  const submitClose = async () => {
    if (!api || !session || busy) return
    setBusy(true)
    setError(null)
    try {
      const entries = CASH_DENOMINATIONS.map((d) => ({
        denomination: d,
        quantity: Math.max(0, Math.floor(Number(counts[d]) || 0)),
      })).filter((e) => e.quantity > 0)
      const result = await api.close(session.id, { counts: entries })
      setClosed(result)
      setMode('result')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

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
      ) : mode === 'result' && closed ? (
        <div className="cash-shift">
          <div className="cash-expected">
            <div className="ce-row">
              <span>{t('cash.expected')}</span>
              <span>{formatCurrency(closed.expectedCash ?? 0)}</span>
            </div>
            <div className="ce-row">
              <span>{t('cash.counted')}</span>
              <span>{formatCurrency(closed.countedCash ?? 0)}</span>
            </div>
            <div className="ce-row grand">
              <span>{t('cash.variance')}</span>
              <span
                className={
                  (closed.varianceCash ?? 0) === 0
                    ? 'var-ok'
                    : (closed.varianceCash ?? 0) > 0
                      ? 'var-over'
                      : 'var-short'
                }
              >
                {(closed.varianceCash ?? 0) > 0 ? '+' : ''}
                {formatCurrency(closed.varianceCash ?? 0)}
              </span>
            </div>
          </div>
          <p className="cash-muted" style={{ marginTop: 12 }}>
            {(closed.varianceCash ?? 0) === 0
              ? t('cash.balanced')
              : (closed.varianceCash ?? 0) > 0
                ? t('cash.over')
                : t('cash.short')}
          </p>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={onClose}>
              {t('cash.done')}
            </Button>
          </div>
        </div>
      ) : mode === 'count' ? (
        <div className="cash-shift">
          <label className="lbl2">{t('cash.countTitle')}</label>
          <p className="cash-muted" style={{ marginTop: -2, marginBottom: 10 }}>
            {t('cash.countHint')}
          </p>
          <div className="denom-grid">
            {CASH_DENOMINATIONS.map((d) => {
              const qty = Math.max(0, Math.floor(Number(counts[d]) || 0))
              return (
                <div className="denom-row" key={d}>
                  <span className="denom-face">{formatCurrency(d)}</span>
                  <span className="denom-x">×</span>
                  <input
                    className="cash-in denom-qty"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={counts[d] ?? ''}
                    onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value }))}
                    placeholder="0"
                  />
                  <span className="denom-sub">{qty > 0 ? formatCurrency(d * qty) : ''}</span>
                </div>
              )
            })}
          </div>
          <div className="ce-row grand" style={{ marginTop: 12 }}>
            <span>{t('cash.countedTotal')}</span>
            <span>{formatCurrency(countedTotal)}</span>
          </div>
          {error ? (
            <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
              {error}
            </p>
          ) : null}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="soft" onClick={() => setMode('operate')} disabled={busy}>
              {t('cash.back')}
            </Button>
            <Button variant="primary" onClick={() => void submitClose()} loading={busy}>
              {t('cash.submitClose')}
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

          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="soft"
              onClick={() => {
                setError(null)
                setCounts({})
                setMode('count')
              }}
            >
              {t('cash.closeShift')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
