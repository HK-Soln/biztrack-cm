import { useEffect, useState } from 'react'
import { Button, Modal } from '@biztrack/ui/biztrack'
import type { CashSession } from '@biztrack/types'
import { useT } from '@/i18n'
import { dataClient } from '@/lib/data-client'

/**
 * Orphaned-shift recovery (BIZ-2.5). On low-end Android with force-kills, an OPEN shift is
 * often left un-closed. On launch, if a shift has been open past the max-shift window, this
 * blocking prompt offers Resume or Close-now. Close-now stamps closed_reason=RECOVERED and
 * leaves the count unknown — a drawer never counted has no defensible variance. Once per
 * app session; the nav shift chip stays available afterwards.
 */
let checkedThisSession = false

export function StaleShiftRecovery() {
  const t = useT()
  const [session, setSession] = useState<CashSession | null>(null)
  const [busy, setBusy] = useState(false)

  const api = dataClient.cashSessions

  useEffect(() => {
    if (checkedThisSession) return
    checkedThisSession = true
    let cancelled = false
    void (async () => {
      try {
        const stale = await api.staleOpen()
        if (!cancelled && stale) setSession(stale)
      } catch {
        // If the check fails, don't block — the nav chip can close the shift manually.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  if (!session) return null

  const resume = () => setSession(null)
  const closeNow = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.recover(session.id)
    } finally {
      setBusy(false)
      setSession(null)
    }
  }

  return (
    <Modal
      open
      onClose={resume}
      title={t('cash.recoverTitle')}
      dismissable={false}
      footer={
        <>
          <Button variant="soft" type="button" onClick={resume} disabled={busy}>
            {t('cash.resume')}
          </Button>
          <Button variant="primary" type="button" onClick={() => void closeNow()} loading={busy}>
            {t('cash.closeNow')}
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 10 }}>{t('cash.recoverBody')}</p>
      <p className="cash-muted">
        {t('cash.openedAt')}: {new Date(session.openedAt).toLocaleString()}
      </p>
    </Modal>
  )
}
