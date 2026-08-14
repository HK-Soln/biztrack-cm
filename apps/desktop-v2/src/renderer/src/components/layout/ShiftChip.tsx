import { useCallback, useEffect, useState } from 'react'
import type { CashSession } from '@biztrack/types'
import { useT } from '@/i18n'
import { CashDrawerSheet } from '@/components/sell/CashDrawerSheet'

/**
 * Persistent shift control in the app header (BIZ-2.4). Shows whether a till shift is
 * open and opens the cash-drawer sheet (open / record movements / close). Desktop-only —
 * the till lives on the device. Replaces the old Sell-screen button.
 */
export function ShiftChip() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<CashSession | null>(null)

  const api = typeof window !== 'undefined' ? window.api?.cashSessions : undefined

  const refresh = useCallback(async () => {
    if (!api) return
    setSession(await api.current())
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!api) return null

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
