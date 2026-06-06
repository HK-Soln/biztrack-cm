'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { SubscriptionPlan, type PlanResourceSummary } from '@biztrack/types'
import { PlanCard } from '@/components/subscription/PlanCard'
import { toast } from 'sonner'
import { listPlans, selectPlan } from '@/services/auth.api'
import { getApiErrorMessage } from '@/services/api-response'
import { routeForNextStep } from '@/lib/auth-routing'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

// ─── Launch flag ──────────────────────────────────────────────────────────────
// Flip to false when plans are live and pricing is confirmed.
// While true, only the Pro plan is selectable — all users get full feature
// access during the launch period.
const IS_LAUNCHING = true

export default function SelectPlanPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()

  const businessId = useAuthStore((s) => s.businessId)
  const accessToken = useAuthStore((s) => s.accessToken)
  const refreshPlanState = usePlanStore((s) => s.refreshPlanState)

  const [plans, setPlans] = useState<PlanResourceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<SubscriptionPlan | null>(null)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  useEffect(() => {
    listPlans()
      .then((data) => setPlans(data.plans))
      .catch((err) => toast.error(getApiErrorMessage(err, t('select_plan.load_error'))))
      .finally(() => setLoading(false))
  }, [t])

  const handleSelect = async (plan: SubscriptionPlan) => {
    if (selecting) return
    setSelecting(plan)
    try {
      const response = await selectPlan({ plan })
      // Refresh the plan store so the TopBar and any plan-gated UI reflects
      // the newly selected plan immediately instead of showing the stale
      // cached FREE state.
      void refreshPlanState({ businessId, accessToken })
      return goTo(routeForNextStep(response.nextStep))
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('select_plan.select_error')))
      setSelecting(null)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-primary">{t('select_plan.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('select_plan.subtitle')}</p>
        {IS_LAUNCHING ? (
          <p className="mt-3 text-sm font-medium text-primary">
            All features are free during the launch period.
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('select_plan.loading')}</p>
      ) : (
        <>
          <div className="w-full max-w-4xl grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isProPlan = plan.name === SubscriptionPlan.PRO
              const lockedByLaunch = IS_LAUNCHING && !isProPlan

              return (
                <PlanCard
                  key={plan.name}
                  plan={plan}
                  mode="onboarding"
                  chooseLabel={lockedByLaunch ? 'Not available' : t('select_plan.choose')}
                  submitting={selecting === plan.name}
                  disabled={selecting !== null || lockedByLaunch}
                  onSelect={(p) => void handleSelect(p)}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
