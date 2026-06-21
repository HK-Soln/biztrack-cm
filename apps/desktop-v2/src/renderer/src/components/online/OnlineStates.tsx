import { Button } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'

const LOCK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 2 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6Z" /></svg>
const WIFI = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0" /><path d="m2 2 20 20" /></svg>

/** An online query error is the plan gate when its message is the tagged code. */
export function isPlanUpgrade(error: unknown): boolean {
  return error instanceof Error && error.message === 'PLAN_UPGRADE_REQUIRED'
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
        <Button variant="primary" onClick={() => { window.location.hash = '#/settings/subscription' }}>{t('online.upsellCta')}</Button>
      </div>
    </div>
  )
}

/** Online store/orders need connectivity (API-only). Shown when a query fails for non-plan reasons. */
export function OnlineOffline({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <div className="online-gate">
      <div className="online-gate-ic muted">{WIFI}</div>
      <h2>{t('online.offlineTitle')}</h2>
      <p>{t('online.offlineBody')}</p>
      <Button variant="soft" onClick={onRetry}>{t('online.retry')}</Button>
    </div>
  )
}
