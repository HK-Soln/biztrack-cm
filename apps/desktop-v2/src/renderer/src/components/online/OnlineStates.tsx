import { Button } from '@biztrack/ui/biztrack'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'

const LOCK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 2 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6Z" /></svg>
const WIFI = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0" /><path d="m2 2 20 20" /></svg>
const WARN = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>

/**
 * The online query failed because the plan doesn't include the storefront. The 403 is mapped
 * to a tagged error in the main proxy; Electron wraps the IPC message, so match by substring.
 */
export function isPlanUpgrade(error: unknown): boolean {
  return error instanceof Error && error.message.includes('PLAN_UPGRADE_REQUIRED')
}

/** True when the renderer reports no network connectivity. */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** Shown to FREE/SOLO plans — the online store is a BUSINESS/PRO feature. */
export function OnlineUpsell() {
  const t = useT()
  return (
    <div className="frame">
      <div className="online-gate">
        <div className="online-gate-ic">{LOCK}</div>
        <h2>{t('online.upsellTitle')}</h2>
        <p>{t('online.upsellBody')}</p>
        <Button variant="primary" onClick={() => { window.location.hash = '#/settings?section=subscription' }}>{t('online.upsellCta')}</Button>
      </div>
    </div>
  )
}

/**
 * Failure state for an online query. Distinguishes a genuine connectivity loss (navigator
 * offline) from a server/request error — the latter surfaces the real message instead of
 * mislabelling everything as "offline".
 */
export function OnlineError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT()
  const offline = isOffline()
  return (
    <div className="online-gate">
      <div className={`online-gate-ic muted`}>{offline ? WIFI : WARN}</div>
      <h2>{offline ? t('online.offlineTitle') : t('online.errorTitle')}</h2>
      <p>{offline ? t('online.offlineBody') : errorMessage(error, t('online.errorBody'))}</p>
      <Button variant="soft" onClick={onRetry}>{t('online.retry')}</Button>
    </div>
  )
}
