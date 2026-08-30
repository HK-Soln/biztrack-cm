import { useCallback, useEffect, useState } from 'react'
import type { CashSession } from '@biztrack/types'
import { useT } from '@/i18n'
import { dataClient } from '@/lib/data-client'
import { CashDrawerSheet } from '@/components/sell/CashDrawerSheet'

/**
 * Persistent shift control in the app header (BIZ-2.4). Shows whether a till shift is
 * open and opens the cash-drawer sheet (open / record movements / close). Works in both
 * builds — local SQLite on desktop, the REST till in the cloud.
 */
export function ShiftChip() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<CashSession | null>(null)

  const refresh = useCallback(async () => {
    try {
      setSession(await dataClient.cashSessions.current())
    } catch {
      setSession(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isOpen = !!session
  return (
    <>
      <button
        type="button"
        className={`shift-chip app-no-drag${isOpen ? ' on' : ''}`}
        onClick={() => setOpen(true)}
        title={isOpen ? t('cash.shiftOpen') : t('cash.shiftClosed')}
      >
        <span className="sc-dot" />
        <span className="sc-label">{t('cash.title')}</span>
      </button>
      <CashDrawerSheet
        open={open}
        onClose={() => {
          setOpen(false)
          void refresh()
        }}
      />
    </>
  )
}
