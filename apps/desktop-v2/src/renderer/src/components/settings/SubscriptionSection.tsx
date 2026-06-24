import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useT, useLangStore } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useCurrency } from '@/lib/currency'
import { useSessionStore } from '@/stores/session.store'
import { errorMessage } from '@/lib/error'
import type { ListPlansResponse, PlanQuotaResource, PlanQuotaUsage } from '@shared/ipc'

type Plan = ListPlansResponse['plans'][number]

const PLAN_ORDER = ['FREE', 'SOLO', 'BUSINESS', 'PRO']
const rank = (name: string): number => {
  const i = PLAN_ORDER.indexOf(name)
  return i < 0 ? 0 : i
}

// Curated capability resources → label, in display order (mirrors the onboarding
// plan picker). Features are derived from the plan's REAL entitlements, not copy.
const CAPABILITIES: Array<{ code: string; label: MessageKey }> = [
  { code: 'SALES_CREATE', label: 'feat.pos' },
  { code: 'REPORTS_DAILY', label: 'feat.dailyReport' },
  { code: 'PRODUCTS_IMPORT_CSV', label: 'feat.csvImport' },
  { code: 'RECEIPTS_WHATSAPP', label: 'feat.whatsappReceipts' },
  { code: 'DEBTS_VIEW', label: 'feat.credit' },
  { code: 'DEPOSITS', label: 'feat.deposits' },
  { code: 'SAVINGS', label: 'feat.savings' },
  { code: 'CHARGES_MULTIPLE', label: 'feat.charges' },
  { code: 'CUSTOM_ROLES', label: 'feat.roles' },
  { code: 'REPORTS_FINANCIAL', label: 'feat.financialReports' },
  { code: 'AGENT_TRACK', label: 'feat.agentTrack' },
  { code: 'BRANCHES_MULTI', label: 'feat.multiBranch' },
  { code: 'API_ACCESS', label: 'feat.api' },
]

const QUOTA_LINES: Array<{ key: PlanQuotaResource; label: MessageKey }> = [
  { key: 'users', label: 'plan.usersLabel' },
  { key: 'products', label: 'plan.productsLabel' },
  { key: 'contacts', label: 'plan.contactsLabel' },
]

const USAGE_LABEL: Partial<Record<PlanQuotaResource, MessageKey>> = {
  products: 'sub.usageProducts',
  users: 'sub.usageTeam',
  contacts: 'sub.usageContacts',
}
const USAGE_ORDER: PlanQuotaResource[] = ['products', 'users', 'contacts']

const PLAN_DESC: Record<string, MessageKey> = {
  FREE: 'sub.desc.FREE',
  SOLO: 'sub.desc.SOLO',
  BUSINESS: 'sub.desc.BUSINESS',
  PRO: 'sub.desc.PRO',
}

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="m5 12 4 4L19 6" /></svg>
)
const Warn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
)

export function SubscriptionSection({ onManageBilling }: { onManageBilling: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const cur = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const refreshSession = useSessionStore((s) => s.refresh)

  const plansQ = useQuery({ queryKey: ['plans', 'list'], queryFn: () => dataClient.plans.list() })
  const subQ = useQuery({ queryKey: ['plans', 'subscription'], queryFn: () => dataClient.plans.subscription() })
  const usageQ = useQuery({ queryKey: ['plans', 'usage'], queryFn: () => dataClient.plans.quotaUsage() })

  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null)
  const [cycle, setCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(id)
  }, [toast])

  const change = useMutation({
    mutationFn: (plan: string) => dataClient.plans.upgrade(plan),
    onSuccess: async () => {
      const target = confirmPlan
      setConfirmPlan(null)
      // Pull new entitlements + any newly-available data into the local store so
      // gating is correct locally, immediately. (Expiry is preserved server-side.)
      try {
        await window.api?.sync?.trigger?.()
      } catch {
        /* sync errors surface in the sync indicator; not fatal to the plan change */
      }
      await refreshSession()
      qc.invalidateQueries({ queryKey: ['plans'] })
      setToast(t('sub.changed').replace('{plan}', target?.displayName ?? ''))
    },
    onError: (e) => {
      setConfirmPlan(null)
      setError(errorMessage(e, t('sub.changeError')))
    },
  })

  const fmtDate = (iso: string | null): string =>
    iso ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : ''

  const plans = useMemo(() => {
    const list = plansQ.data?.plans ?? []
    return [...list].sort((a, b) => rank(a.name) - rank(b.name))
  }, [plansQ.data])

  const currentPlanName = subQ.data?.plan ?? plansQ.data?.currentPlan ?? null
  const currentPlan = plans.find((p) => p.name === currentPlanName) ?? null

  if (plansQ.isError || subQ.isError) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12 }}>{t('sub.loadError')}</div>
        <Button variant="soft" type="button" onClick={() => { void plansQ.refetch(); void subQ.refetch(); void usageQ.refetch() }}>
          {t('settings.bp.retry')}
        </Button>
      </div>
    )
  }
  if (plansQ.isLoading || subQ.isLoading || !currentPlan) {
    return <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>…</div>
  }

  const sub = subQ.data!
  const priceLabel = currentPlan.priceXAF === 0 ? t('sub.free') : cur.format(currentPlan.priceXAF)
  const statusLine = sub.cancelAtPeriodEnd && sub.currentPeriodEnd
    ? t('sub.cancelsOn').replace('{date}', fmtDate(sub.currentPeriodEnd))
    : sub.status === 'TRIAL'
      ? t('sub.trialLeft').replace('{days}', String(sub.trialDaysRemaining)) + (sub.trialEndsAt ? ` · ${fmtDate(sub.trialEndsAt)}` : '')
      : sub.currentPeriodEnd
        ? t('sub.renews').replace('{date}', fmtDate(sub.currentPeriodEnd))
        : t('sub.active')

  const usage: PlanQuotaUsage[] = (usageQ.data?.quotaUsage ?? [])
    .filter((u) => USAGE_ORDER.includes(u.resource))
    .sort((a, b) => USAGE_ORDER.indexOf(a.resource) - USAGE_ORDER.indexOf(b.resource))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Current plan hero */}
      <div className="plan-hero">
        <div>
          <span className="pill">{t('sub.currentPlan')}</span>
          <h2>{currentPlan.displayName}</h2>
          <p>{statusLine}</p>
        </div>
        <div className="spacer" />
        <div className="meta">
          <div className="big">{priceLabel}{currentPlan.priceXAF !== 0 ? <small> {t('sub.perMonth')}</small> : null}</div>
          <div className="sm">{t('sub.billedMonthly')} · {t('bill.momoType')} · +237 6 78 •• •• 02</div>
        </div>
        <button className="hbtn" type="button" onClick={onManageBilling}>{t('sub.manageBilling')}</button>
      </div>

      {/* Usage */}
      {usage.length > 0 ? (
        <div className="usage">
          {usage.map((u) => {
            const pct = u.unlimited || u.limit == null || u.limit === 0 ? (u.unlimited ? 8 : 0) : Math.min(100, Math.round((u.used / u.limit) * 100))
            return (
              <div className="u" key={u.resource}>
                <div className="k">{t((USAGE_LABEL[u.resource] ?? 'sub.usageProducts') as MessageKey)}</div>
                <div className="v">
                  {cur.plain(u.used)} <small>/ {u.unlimited || u.limit == null ? t('plan.unlimited').toLowerCase() : cur.plain(u.limit)}</small>
                </div>
                <div className="pay-track"><div className="pay-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Compare plans */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div className="sec-label" style={{ margin: 0 }}>{t('sub.comparePlans')}</div>
          <div style={{ flex: 1 }} />
          <span className="seg-pick">
            <button type="button" aria-pressed={cycle === 'MONTHLY'} onClick={() => setCycle('MONTHLY')}>{t('sub.monthly')}</button>
            <button type="button" aria-pressed={cycle === 'ANNUAL'} onClick={() => setCycle('ANNUAL')}>{t('sub.yearly')}</button>
          </span>
          {cycle === 'ANNUAL' ? <span className="chip-tag chip-save">{t('sub.annualSave')}</span> : null}
        </div>
        <div className="plans">
          {plans.map((p) => {
            const isCurrent = p.name === currentPlan.name
            const isUpgrade = rank(p.name) > rank(currentPlan.name)
            const prev = p.inheritsFrom ? plans.find((x) => x.name === p.inheritsFrom) ?? null : null
            const descKey = PLAN_DESC[p.name]
            return (
              <div className={`plan${isCurrent ? ' current' : ''}`} key={p.name}>
                {isCurrent ? <span className="tagtop">{t('sub.tagCurrent')}</span> : null}
                <div className="pn">{p.displayName}</div>
                <div className="pr">
                  {(() => {
                    const price = cycle === 'ANNUAL' ? p.priceAnnualXAF : p.priceXAF
                    return (
                      <>
                        {price === 0 ? '0' : cur.plain(price)}
                        <small> {price === 0 ? 'FCFA' : cycle === 'ANNUAL' ? t('sub.fcfaYear') : t('sub.fcfaMonth')}</small>
                      </>
                    )
                  })()}
                </div>
                <div className="pd">{descKey ? t(descKey) : ''}</div>
                <ul>
                  {featuresFor(p, prev, t).map((f, i) => (
                    <li key={i}><Check />{f}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`pbtn${isUpgrade && !isCurrent ? ' upgrade' : ''}`}
                  disabled={isCurrent || change.isPending}
                  onClick={() => setConfirmPlan(p)}
                >
                  {isCurrent ? t('sub.current') : isUpgrade ? t('sub.upgrade') : t('sub.downgrade')}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Billing preferences (coming soon — no payment integration yet) */}
      <div className="card">
        <div className="fsec-h">{t('sub.billingPrefs')}</div>
        <div className="banner" style={{ marginBottom: 6 }}><Warn />{t('sub.comingSoon')}</div>
        <BillingPrefLine nm={t('sub.autoRenew')} ds={t('sub.autoRenewDesc')} on />
        <BillingPrefLine nm={t('sub.emailInvoices')} ds={t('sub.emailInvoicesDesc')} on />
        <BillingPrefLine nm={t('sub.usageAlerts')} ds={t('sub.usageAlertsDesc')} />
      </div>

      {error ? <div className="banner warn"><Warn />{error}</div> : null}
      {toast ? (
        <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: 'var(--success)', display: 'inline-flex' }}><Check /></span>{toast}
        </div>
      ) : null}

      {confirmPlan ? (
        <ConfirmChange
          target={confirmPlan}
          isUpgrade={rank(confirmPlan.name) > rank(currentPlan.name)}
          pending={change.isPending}
          onCancel={() => setConfirmPlan(null)}
          onConfirm={() => change.mutate(confirmPlan.name)}
        />
      ) : null}
    </div>
  )
}

function BillingPrefLine({ nm, ds, on }: { nm: string; ds: string; on?: boolean }) {
  return (
    <div className="set-line">
      <div>
        <div className="nm">{nm}</div>
        <div className="ds">{ds}</div>
      </div>
      <button type="button" className={`switch${on ? ' on' : ''}`} disabled aria-pressed={!!on} />
    </div>
  )
}

function ConfirmChange({
  target,
  isUpgrade,
  pending,
  onCancel,
  onConfirm,
}: {
  target: Plan
  isUpgrade: boolean
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h2>{(isUpgrade ? t('sub.confirmUpTitle') : t('sub.confirmDownTitle')).replace('{plan}', target.displayName)}</h2>
        </div>
        <div className="modal-body" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {t('sub.confirmBody')}
        </div>
        <div className="modal-foot">
          <Button variant="soft" type="button" onClick={onCancel} disabled={pending}>{t('sub.cancel')}</Button>
          <Button variant="primary" type="button" loading={pending} onClick={onConfirm}>
            {isUpgrade ? t('sub.confirmUp') : t('sub.confirmDown')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function featuresFor(p: Plan, prev: Plan | null, t: (k: MessageKey) => string): string[] {
  const feats: string[] = []
  const fmtQuota = (n: number | null): string => (n === null ? t('plan.unlimited') : String(n))
  for (const { key, label } of QUOTA_LINES) {
    const prevQ = prev?.quotas[key]
    if (!prev || p.quotas[key] !== prevQ) feats.push(`${fmtQuota(p.quotas[key])} ${t(label)}`)
  }
  const source = p.inheritsFrom ? p.additionalResources : p.resources
  for (const cap of CAPABILITIES) if (source.includes(cap.code)) feats.push(t(cap.label))
  return feats.slice(0, 4)
}
