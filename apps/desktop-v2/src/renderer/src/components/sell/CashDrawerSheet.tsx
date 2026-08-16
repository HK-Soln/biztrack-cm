import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, CommandSelect, Input, Modal } from '@biztrack/ui/biztrack'
import {
  CASH_DENOMINATIONS,
  CashMovementKind,
  CashVarianceReason,
  isCashVarianceWithinTolerance,
  type CashSession,
  type CashVarianceHistory,
} from '@biztrack/types'
import { formatCurrency } from '@biztrack/utils'
import { useT } from '@/i18n'

/**
 * Cash-drawer sheet (BIZ-2.3 / 2.4), opened from the nav shift chip. Open a shift with a
 * float, record off-book cash movements (owner draw, drop, change, supplier payment,
 * transfers to MoMo/Orange/bank), and close with a blind denomination count that reveals
 * the variance. The operate view deliberately shows NO expected/running total — the
 * count is blind. Desktop-only (the till lives on the device).
 */

// Only drawer-native movements that have no other home. Supplier/customer payments,
// expenses and deposits are entered in their own modules; when those are paid in cash
// they feed the drawer automatically (they record a cash_movement of the right kind).
const MOVEMENT_KINDS: CashMovementKind[] = [
  CashMovementKind.OWNER_DRAW,
  CashMovementKind.CHANGE_IN,
  CashMovementKind.CHANGE_OUT,
  CashMovementKind.DROP,
  CashMovementKind.TRANSFER_TO_MTN_MOMO,
  CashMovementKind.TRANSFER_TO_ORANGE_MONEY,
  CashMovementKind.TRANSFER_TO_BANK,
]

type Mode = 'operate' | 'count' | 'result'

const VARIANCE_REASONS: CashVarianceReason[] = [
  CashVarianceReason.CHANGE_ERROR,
  CashVarianceReason.UNRECORDED_SALE,
  CashVarianceReason.UNRECORDED_EXPENSE,
  CashVarianceReason.UNKNOWN,
]

/**
 * Per-cashier drawer-accuracy over the last 30 days (BIZ-2.6) — "a single gap means nothing;
 * a pattern is everything". Ranked worst-first by total drawer error. Desktop-only; read from
 * the local shift history so it works offline.
 */
function CashierAccuracy({ t }: { t: ReturnType<typeof useT> }) {
  const api = typeof window !== 'undefined' ? window.api?.cashSessions : undefined
  const [hist, setHist] = useState<CashVarianceHistory | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    if (!api?.varianceHistory) {
      setLoaded(true)
      return
    }
    void api.varianceHistory().then((h) => {
      if (alive) {
        setHist(h)
        setLoaded(true)
      }
    })
    return () => {
      alive = false
    }
  }, [api])

  if (!api?.varianceHistory) return null
  return (
    <div
      className="cash-accuracy"
      style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}
    >
      <div className="lbl2">{t('cash.accuracyTitle')}</div>
      <p className="cash-muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>
        {t('cash.accuracySub').replace('{tol}', formatCurrency(hist?.toleranceXaf ?? 100))}
      </p>
      {!loaded ? (
        <p className="cash-muted">{t('cash.loading')}</p>
      ) : !hist || hist.cashiers.length === 0 ? (
        <p className="cash-muted">{t('cash.accuracyEmpty')}</p>
      ) : (
        <div className="acc-list">
          {hist.cashiers.map((c) => {
            const mean = c.meanVarianceCash
            const meanCls = mean === 0 ? 'var-ok' : mean > 0 ? 'var-over' : 'var-short'
            const flagged = c.outsideToleranceCount > 0
            return (
              <div
                className="acc-row"
                key={c.userId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.cashierName || '—'}
                  </div>
                  <div className="cash-muted" style={{ fontSize: 12 }}>
                    {t('cash.accuracyShifts').replace('{n}', String(c.shifts))}
                    {' · '}
                    {t('cash.accuracyMean')}{' '}
                    <span className={meanCls}>
                      {mean > 0 ? '+' : ''}
                      {formatCurrency(mean)}
                    </span>
                    {c.worstShift ? (
                      <>
                        {' · '}
                        {t('cash.accuracyWorst')} {formatCurrency(c.worstShift.varianceCash)}
                      </>
                    ) : null}
                  </div>
                </div>
                <span
                  className="chip"
                  style={
                    flagged ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined
                  }
                >
                  {t('cash.accuracyOutside').replace('{pct}', String(c.pctOutsideTolerance))}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function CashDrawerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<CashSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Open-shift form — counted by denomination, same as the close count (#1).
  const [openCounts, setOpenCounts] = useState<Record<number, string>>({})
  // Movement form
  const [kind, setKind] = useState<CashMovementKind>(CashMovementKind.OWNER_DRAW)
  const [amountInput, setAmountInput] = useState('')
  const [note, setNote] = useState('')
  const [recorded, setRecorded] = useState<string | null>(null)
  // Close flow
  const [mode, setMode] = useState<Mode>('operate')
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [closed, setClosed] = useState<CashSession | null>(null)
  const [varReason, setVarReason] = useState<CashVarianceReason | null>(null)
  const [varNote, setVarNote] = useState('')

  const api = typeof window !== 'undefined' ? window.api?.cashSessions : undefined

  const kindOptions = useMemo(
    () =>
      MOVEMENT_KINDS.map((k) => ({
        value: k,
        label: t(`cash.kind.${k}`),
        sublabel: t(`cash.desc.${k}`),
      })),
    [t],
  )
  const loadKindOptions = useCallback(
    async (search: string) => {
      const s = search.trim().toLowerCase()
      return kindOptions.filter(
        (o) => !s || o.label.toLowerCase().includes(s) || o.sublabel.toLowerCase().includes(s),
      )
    },
    [kindOptions],
  )

  const countedTotal = CASH_DENOMINATIONS.reduce(
    (sum, d) => sum + d * Math.max(0, Math.floor(Number(counts[d]) || 0)),
    0,
  )
  const openingFloatTotal = CASH_DENOMINATIONS.reduce(
    (sum, d) => sum + d * Math.max(0, Math.floor(Number(openCounts[d]) || 0)),
    0,
  )

  const refresh = useCallback(async () => {
    if (!api) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setSession(await api.current())
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (open) {
      setError(null)
      setRecorded(null)
      setMode('operate')
      setCounts({})
      setOpenCounts({})
      setClosed(null)
      setVarReason(null)
      setVarNote('')
      void refresh()
    }
  }, [open, refresh])

  const openShift = async () => {
    if (!api || busy) return
    const openingFloat = openingFloatTotal
    if (openingFloat < 0) return
    setBusy(true)
    setError(null)
    try {
      await api.open({ openingFloat })
      setOpenCounts({})
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
      setRecorded(`${t(`cash.kind.${kind}`)} · ${formatCurrency(amount)}`)
      setAmountInput('')
      setNote('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

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

  const finishClose = async () => {
    if (!api || !closed || busy) return
    const needsReason = !isCashVarianceWithinTolerance(closed.varianceCash ?? 0)
    if (needsReason && !varReason) {
      setError(t('cash.reasonRequired'))
      return
    }
    if (needsReason && varReason) {
      setBusy(true)
      setError(null)
      try {
        await api.setVarianceReason(closed.id, {
          reason: varReason,
          note: varNote.trim() || undefined,
        })
      } catch (e) {
        setError((e as Error).message)
        setBusy(false)
        return
      }
      setBusy(false)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('cash.title')} dismissable={false}>
      {loading ? (
        <p className="cash-muted">{t('cash.loading')}</p>
      ) : !api ? (
        <p className="cash-muted">{t('cash.desktopOnly')}</p>
      ) : !session ? (
        <div className="cash-open">
          <p style={{ marginBottom: 12 }}>{t('cash.noShift')}</p>
          <label className="lbl2">{t('cash.openingFloat')}</label>
          <p className="cash-muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
            {t('cash.openingFloatHint')}
          </p>
          <div className="denom-grid">
            {CASH_DENOMINATIONS.map((d) => {
              const qty = Math.max(0, Math.floor(Number(openCounts[d]) || 0))
              return (
                <div className="denom-row" key={d}>
                  <span className="denom-face">{formatCurrency(d)}</span>
                  <span className="denom-x">×</span>
                  <Input
                    className="denom-qty"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={openCounts[d] ?? ''}
                    onChange={(e) => setOpenCounts((c) => ({ ...c, [d]: e.target.value }))}
                    placeholder="0"
                  />
                  <span className="denom-sub">{qty > 0 ? formatCurrency(d * qty) : ''}</span>
                </div>
              )
            })}
          </div>
          <div className="ce-row grand" style={{ marginTop: 12 }}>
            <span>{t('cash.floatTotal')}</span>
            <span>{formatCurrency(openingFloatTotal)}</span>
          </div>
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
          <CashierAccuracy t={t} />
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

          {!isCashVarianceWithinTolerance(closed.varianceCash ?? 0) ? (
            <div className="cash-record" style={{ marginTop: 14 }}>
              <label className="lbl2">{t('cash.varianceReasonTitle')}</label>
              <div className="chips" style={{ marginTop: 6 }}>
                {VARIANCE_REASONS.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={`chip${varReason === r ? ' on' : ''}`}
                    onClick={() => {
                      setVarReason(r)
                      setError(null)
                    }}
                  >
                    {t(`cash.reason.${r}`)}
                  </button>
                ))}
              </div>
              <Input
                type="text"
                value={varNote}
                onChange={(e) => setVarNote(e.target.value)}
                placeholder={t('cash.notePlaceholder')}
                style={{ marginTop: 10 }}
              />
            </div>
          ) : null}

          {error ? (
            <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
              {error}
            </p>
          ) : null}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={() => void finishClose()} loading={busy}>
              {t('cash.done')}
            </Button>
          </div>
        </div>
      ) : mode === 'count' ? (
        <div className="cash-shift">
          <label className="lbl2">{t('cash.countTitle')}</label>
          <div className="denom-grid" style={{ marginTop: 8 }}>
            {CASH_DENOMINATIONS.map((d) => {
              const qty = Math.max(0, Math.floor(Number(counts[d]) || 0))
              return (
                <div className="denom-row" key={d}>
                  <span className="denom-face">{formatCurrency(d)}</span>
                  <span className="denom-x">×</span>
                  <Input
                    className="denom-qty"
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
          <div className="cash-record">
            <label className="lbl2">{t('cash.recordMovement')}</label>
            <CommandSelect
              value={kind}
              valueLabel={t(`cash.kind.${kind}`)}
              onChange={(v) => {
                if (v) setKind(v as CashMovementKind)
                setRecorded(null)
              }}
              loadOptions={loadKindOptions}
              placeholder={t('cash.pickKind')}
              searchPlaceholder={t('cash.searchKind')}
            />
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder={t('cash.amount')}
              style={{ marginTop: 10 }}
            />
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('cash.notePlaceholder')}
              style={{ marginTop: 8 }}
            />
            {recorded ? (
              <p className="cash-recorded" role="status">
                ✓ {recorded}
              </p>
            ) : null}
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

          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {/* Just hides the panel — the shift keeps running. Separated from "Close shift"
                so recording a withdrawal is never mistaken for ending the day (#4). */}
            <Button variant="soft" onClick={onClose}>
              {t('cash.dismiss')}
            </Button>
            <Button
              variant="danger"
              title={t('cash.closeShiftHint')}
              onClick={() => {
                setError(null)
                setRecorded(null)
                setCounts({})
                setMode('count')
              }}
            >
              {t('cash.closeShift')}
            </Button>
          </div>
          <CashierAccuracy t={t} />
        </div>
      )}
    </Modal>
  )
}
