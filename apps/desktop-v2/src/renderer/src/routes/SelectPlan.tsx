import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { BillingCycle, PlanQuotas, PlanSummary } from '@shared/ipc'
import { useSessionStore } from '@/stores/session.store'
import { routeForNextStep } from '@/lib/auth-routing'

const RECOMMENDED = 'BUSINESS'

// Curated capability resources → label, in display order. Features shown per plan
// are derived from the plan's REAL entitlements (backend resources/quotas), not
// hard-coded marketing copy.
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

function fmtXAF(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
    <path d="m5 12 4 4L19 6" />
  </svg>
)

// Phase 2 onboarding: pick a plan (monthly or annual). Selecting flips the business
// to ACTIVE via the BFF, which then re-resolves the backend nextStep (→ dashboard).
export function SelectPlan() {
  const navigate = useNavigate()
  const t = useT()
  const setStatus = useSessionStore((s) => s.setStatus)

  const [plans, setPlans] = useState<PlanSummary[] | null>(null)
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY')
  const [selected, setSelected] = useState<string>(RECOMMENDED)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!window.api?.auth) {
      setPlans([])
      return
    }
    window.api.auth
      .listPlans()
      .then((res) => {
        if (!active) return
        setPlans(res.plans)
        const preferred = res.currentPlan ?? RECOMMENDED
        const exists = res.plans.some((p) => p.name === preferred)
        setSelected(exists ? preferred : (res.plans[0]?.name ?? RECOMMENDED))
      })
      .catch(() => {
        if (active) setPlans([])
      })
    return () => {
      active = false
    }
  }, [])

  const selectedPlan = plans?.find((p) => p.name === selected) ?? null
  const isFree = !!selectedPlan && selectedPlan.priceXAF === 0 && selectedPlan.priceAnnualXAF === 0
  // Free-trial length is backend-driven (config MVP_PAID_PLAN_TRIAL_DAYS) — never hard-coded.
  const trialDays = plans?.reduce((max, p) => Math.max(max, p.trialDays), 0) ?? 0
  const subtitle = trialDays > 0 ? t('plan.subtitle').replace('{days}', String(trialDays)) : t('plan.subtitleShort')

  const submit = async () => {
    if (busy || !window.api?.auth || !selectedPlan) return
    setBusy(true)
    setError(null)
    const res = await window.api.auth.selectPlan(selected, cycle)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? t('plan.error'))
      return
    }
    setStatus(res.session)
    navigate(routeForNextStep(res.nextStep))
  }

  const fmtQuota = (n: number | null): string => (n === null ? t('plan.unlimited') : String(n))

  // Real per-plan feature list: quota increases over the inherited plan + the
  // curated capabilities this plan actually grants (additional ones for paid plans).
  const featuresFor = (p: PlanSummary): string[] => {
    const prev = p.inheritsFrom ? plans?.find((x) => x.name === p.inheritsFrom) : null
    const prevQ = prev?.quotas
    const feats: string[] = []
    const quotaLine = (key: keyof PlanQuotas, label: MessageKey) => {
      if (!prevQ || p.quotas[key] !== prevQ[key]) feats.push(`${fmtQuota(p.quotas[key])} ${t(label)}`)
    }
    quotaLine('users', 'plan.usersLabel')
    quotaLine('products', 'plan.productsLabel')
    quotaLine('contacts', 'plan.contactsLabel')
    const source = p.inheritsFrom ? p.additionalResources : p.resources
    for (const cap of CAPABILITIES) if (source.includes(cap.code)) feats.push(t(cap.label))
    return feats
  }

  const noteFor = (p: PlanSummary): string | null => {
    if (!p.inheritsFrom) return null
    const prevName = plans?.find((x) => x.name === p.inheritsFrom)?.displayName ?? p.inheritsFrom
    return t('plan.everythingPlus').replace('{plan}', prevName)
  }

  return (
    <div className="auth-card" style={{ maxWidth: 820 }}>
      <div className="auth-logo">
        <div className="mk">B</div>
        <div className="wm">BizTrack CM</div>
      </div>
      <div className="auth-h" style={{ textAlign: 'center' }}>
        <h1>{t('plan.title')}</h1>
        <p>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <span className="fseg" style={{ width: 'auto' }}>
          <button type="button" aria-pressed={cycle === 'MONTHLY'} onClick={() => setCycle('MONTHLY')}>
            {t('plan.cycleMonthly')}
          </button>
          <button type="button" aria-pressed={cycle === 'ANNUAL'} onClick={() => setCycle('ANNUAL')}>
            {t('plan.cycleAnnual')}
            <span className="chip-tag chip-save">{t('plan.annualSave')}</span>
          </button>
        </span>
      </div>

      {plans === null ? (
        <div className="biz-empty">{t('plan.loading')}</div>
      ) : plans.length === 0 ? (
        <div className="biz-empty">{t('plan.loadError')}</div>
      ) : (
        <div className="aplans">
          {plans.map((p) => {
            const free = p.priceXAF === 0 && p.priceAnnualXAF === 0
            const amount = cycle === 'MONTHLY' ? p.priceXAF : p.priceAnnualXAF
            const note = noteFor(p)
            return (
              <button
                key={p.name}
                type="button"
                className={`aplan${selected === p.name ? ' sel' : ''}`}
                onClick={() => setSelected(p.name)}
                disabled={busy}
              >
                <div className="atop">
                  <span className="rdot" />
                  <span className="aname">
                    <span className="pn">{p.displayName}</span>
                    {p.name === RECOMMENDED ? <span className="ptag">{t('plan.recommended')}</span> : null}
                  </span>
                </div>
                <div className="pricebox">
                  <span className="pr">{fmtXAF(amount)}</span>
                  <span className={`pcyc${free ? ' free' : ''}`}>
                    {free ? t('plan.freeForever') : cycle === 'MONTHLY' ? t('plan.perMonth') : t('plan.perYear')}
                  </span>
                </div>
                {note ? <div className="pnote">{note}</div> : null}
                <ul className="feats">
                  {featuresFor(p).map((f, i) => (
                    <li key={i}>
                      <Check />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>
      )}

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      <Button
        variant="primary"
        block
        loading={busy}
        disabled={!selectedPlan}
        style={{ marginTop: 18 }}
        onClick={() => void submit()}
      >
        {isFree ? t('plan.continueFree') : t('plan.start')}
      </Button>
    </div>
  )
}
