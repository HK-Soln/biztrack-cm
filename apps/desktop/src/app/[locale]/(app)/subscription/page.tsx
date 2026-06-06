'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { SubscriptionPlan, SubscriptionStatus } from '@biztrack/types'

// ─── Launch flag ──────────────────────────────────────────────────────────────
// Flip to false when plans are live and pricing is confirmed.
const IS_LAUNCHING = true
import type { CurrentSubscriptionResponse, PlanResourceSummary } from '@biztrack/types'
import { Button } from '@biztrack/ui'
import { CreditCard } from 'lucide-react'
import { cancelPlan, listPlans, mySubscription, upgradePlan } from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'
import { PlanCard } from '@/components/subscription/PlanCard'

function formatLocalDate(isoString: string | null | undefined, locale: string): string {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function SubscriptionPage() {
  const t = useTranslations('app.subscription')
  const locale = useLocale()
  const accessToken = useAuthStore((state) => state.accessToken)
  const businessId = useAuthStore((state) => state.businessId)
  const refreshPlanState = usePlanStore((state) => state.refreshPlanState)

  const [plans, setPlans] = useState<PlanResourceSummary[]>([])
  const [subscription, setSubscription] = useState<CurrentSubscriptionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switchSuccess, setSwitchSuccess] = useState<string | null>(null)

  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [plansData, subData] = await Promise.all([listPlans(), mySubscription()])
      setPlans(plansData.plans)
      setSubscription(subData)
    } catch (err) {
      setLoadError(getApiErrorMessage(err, t('load_error')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSwitchError(null)
    setSwitchSuccess(null)
    setPendingPlan(plan)
  }

  const handleCancelPending = () => {
    setPendingPlan(null)
  }

  const handleConfirmSwitch = async () => {
    if (!pendingPlan) return
    setSwitching(true)
    setSwitchError(null)
    try {
      await upgradePlan({ plan: pendingPlan })
      const targetPlan = plans.find((p) => p.name === pendingPlan)
      setSwitchSuccess(t('upgrade_success', { plan: targetPlan?.displayName ?? pendingPlan }))
      setPendingPlan(null)
      await Promise.all([
        load(),
        refreshPlanState({ businessId, accessToken }),
      ])
    } catch (err) {
      setSwitchError(getApiErrorMessage(err, t('upgrade_error')))
    } finally {
      setSwitching(false)
    }
  }

  const handleCancelSubscription = async () => {
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelPlan()
      setCancelSuccess(t('cancel_success'))
      setShowCancelConfirm(false)
      await load()
    } catch (err) {
      setCancelError(getApiErrorMessage(err, t('cancel_error')))
    } finally {
      setCancelling(false)
    }
  }

  const statusLabel = subscription
    ? {
        [SubscriptionStatus.TRIAL]: t('status_trial'),
        [SubscriptionStatus.ACTIVE]: t('status_active'),
        [SubscriptionStatus.PAST_DUE]: t('status_past_due'),
        [SubscriptionStatus.CANCELLED]: t('status_cancelled'),
        [SubscriptionStatus.SUSPENDED]: t('status_suspended'),
      }[subscription.status] ?? subscription.status
    : null

  const statusVariant = subscription
    ? ({
        [SubscriptionStatus.TRIAL]: 'blue',
        [SubscriptionStatus.ACTIVE]: 'green',
        [SubscriptionStatus.PAST_DUE]: 'amber',
        [SubscriptionStatus.CANCELLED]: 'red',
        [SubscriptionStatus.SUSPENDED]: 'red',
      }[subscription.status] ?? 'default')
    : 'default'

  const statusColorClass = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    default: 'bg-secondary text-muted-foreground',
  }[statusVariant]

  const showCancelSection =
    !IS_LAUNCHING &&
    subscription &&
    subscription.plan !== SubscriptionPlan.FREE &&
    subscription.status !== SubscriptionStatus.CANCELLED &&
    subscription.status !== SubscriptionStatus.SUSPENDED &&
    !subscription.cancelAtPeriodEnd

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <CreditCard className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        {IS_LAUNCHING ? (
          <p className="mt-3 text-sm font-medium text-primary">{t('launch_banner')}</p>
        ) : null}
      </div>

      {/* Loading / Error */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : loadError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm font-medium text-primary underline underline-offset-2"
          >
            {t('retry')}
          </button>
        </div>
      ) : null}

      {/* Current subscription card */}
      {!loading && subscription ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('current_plan_section')}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-bold text-foreground">
                  {plans.find((p) => p.name === subscription.plan)?.displayName ?? subscription.plan}
                </span>
                {statusLabel ? (
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', statusColorClass)}>
                    {statusLabel}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {subscription.status === SubscriptionStatus.TRIAL && subscription.trialEndsAt ? (
                  <>
                    <p>{t('trial_ends', { date: formatLocalDate(subscription.trialEndsAt, locale) })}</p>
                    {subscription.trialDaysRemaining > 0 ? (
                      <p className="font-medium text-foreground">
                        {t('trial_days_left', { count: subscription.trialDaysRemaining })}
                      </p>
                    ) : null}
                  </>
                ) : subscription.currentPeriodEnd && !subscription.cancelAtPeriodEnd ? (
                  <p>{t('billing_renews', { date: formatLocalDate(subscription.currentPeriodEnd, locale) })}</p>
                ) : subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    {t('cancelled_notice', { date: formatLocalDate(subscription.currentPeriodEnd, locale) })}
                  </p>
                ) : subscription.plan === SubscriptionPlan.FREE ? (
                  <p>{t('no_billing')}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Status messages */}
          {switchSuccess ? (
            <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {switchSuccess}
            </p>
          ) : null}
          {switchError ? (
            <p className="mt-3 text-sm text-destructive">{switchError}</p>
          ) : null}
          {cancelSuccess ? (
            <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400">
              {cancelSuccess}
            </p>
          ) : null}
          {cancelError ? (
            <p className="mt-3 text-sm text-destructive">{cancelError}</p>
          ) : null}
        </div>
      ) : null}

      {/* Plans grid */}
      {!loading && plans.length > 0 ? (
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t('plans_heading')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const isProPlan = plan.name === SubscriptionPlan.PRO
              const lockedByLaunch = IS_LAUNCHING && !isProPlan
              return (
                <PlanCard
                  key={plan.name}
                  plan={plan}
                  mode="subscription"
                  currentPlan={subscription?.plan ?? null}
                  pendingPlan={pendingPlan}
                  switching={switching}
                  locked={lockedByLaunch}
                  lockedLabel={t('not_available')}
                  onSelect={handleSelectPlan}
                  onCancelConfirm={handleConfirmSwitch}
                  onCancelPending={handleCancelPending}
                />
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Cancel subscription */}
      {!loading && showCancelSection ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t('cancel_section_title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('cancel_section_body')}</p>

          {!showCancelConfirm ? (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="mt-3 text-sm font-medium text-destructive underline underline-offset-2 hover:opacity-80"
            >
              {t('cancel_action')}
            </button>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelling}
              >
                {t('cancel_cancel_action')}
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleCancelSubscription()}
                disabled={cancelling}
              >
                {cancelling ? t('cancelling') : t('cancel_confirm')}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
