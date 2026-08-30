import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import { dataClient } from '@/lib/data-client'

/**
 * Login-time start-shift prompt (BIZ-2.4). Shown once per app session to users whose role
 * runs a till (tracks_cash_drawer) when no shift is open — they can start one with an
 * opening float or dismiss (sales then are "ventes hors caisse"). Works in both builds; the
 * nav shift chip remains available to start/close anytime.
 */
let promptedThisSession = false

export function StartShiftPrompt() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [floatInput, setFloatInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = dataClient.cashSessions

  useEffect(() => {
    if (promptedThisSession) return
    let cancelled = false
    void (async () => {
      try {
        const [tracks, current] = await Promise.all([api.roleTracksDrawer(), api.current()])
        if (!cancelled && tracks && !current) {
          promptedThisSession = true
          setOpen(true)
        }
      } catch {
        // If the check fails, don't nag — the nav chip is always available.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  const start = async () => {
    if (busy) return
    const openingFloat = Math.round(Number(floatInput) || 0)
    if (openingFloat < 0) return
    setBusy(true)
    setError(null)
    try {
      await api.open({ openingFloat })
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('cash.startPromptTitle')}
      dismissable={false}
      footer={
        <>
          <Button variant="soft" type="button" onClick={() => setOpen(false)} disabled={busy}>
            {t('cash.notNow')}
          </Button>
          <Button variant="primary" type="button" onClick={() => void start()} loading={busy}>
            {t('cash.openShift')}
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 12 }}>{t('cash.startPromptBody')}</p>
      <label className="lbl2">{t('cash.openingFloat')}</label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={floatInput}
        onChange={(e) => setFloatInput(e.target.value)}
        placeholder="0"
        autoFocus
      />
      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
