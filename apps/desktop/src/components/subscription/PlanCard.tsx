'use client'

import { Button } from '@biztrack/ui'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { PlanResourceSummary, SubscriptionPlan } from '@biztrack/types'
import { cn } from '@/lib/utils'

const PLAN_ORDER: SubscriptionPlan[] = ['FREE', 'SOLO', 'BUSINESS', 'PRO'] as SubscriptionPlan[]

function getPlanRank(plan: SubscriptionPlan): number {
  return PLAN_ORDER.indexOf(plan)
}

// ─── Shared props ─────────────────────────────────────────────────────────────

type OnboardingProps = {
  mode: 'onboarding'
  /** Label for the action button — caller supplies the translated string. */
  chooseLabel: string
  /** True when this specific card's API call is in flight. */
  submitting: boolean
  /** True when any card is in flight (disables all other buttons). */
  disabled: boolean
  onSelect: (plan: SubscriptionPlan) => void
}

type SubscriptionProps = {
  mode: 'subscription'
  currentPlan: SubscriptionPlan | null
  pendingPlan: SubscriptionPlan | null
  /** True while the upgrade/downgrade API call is in flight. */
  switching: boolean
  /** When true the card is not selectable (launch-period lock, etc.). */
  locked?: boolean
  /** Button label shown when locked. */
  lockedLabel?: string
  onSelect: (plan: SubscriptionPlan) => void
  onCancelConfirm: () => void
  onCancelPending: () => void
}

export type PlanCardProps = { plan: PlanResourceSummary } & (OnboardingProps | SubscriptionProps)

// ─── Component ────────────────────────────────────────────────────────────────

export function PlanCard(props: PlanCardProps) {
  const { plan } = props
  const t = useTranslations('app.subscription')

  const isFree = plan.priceXAF === 0

  const quotaItems = [
    plan.quotas.products === null
      ? t('quota_products_unlimited')
      : t('quota_products', { count: plan.quotas.products }),
    plan.quotas.contacts === null
      ? t('quota_contacts_unlimited')
      : t('quota_contacts', { count: plan.quotas.contacts }),
    plan.quotas.categories === null
      ? t('quota_categories_unlimited')
      : t('quota_categories', { count: plan.quotas.categories }),
    plan.quotas.users === null
      ? t('quota_users_unlimited')
      : t('quota_users', { count: plan.quotas.users }),
  ]

  // ── Subscription-mode derived state ────────────────────────────────────────
  const isCurrent =
    props.mode === 'subscription' ? plan.name === props.currentPlan : false
  const isPending =
    props.mode === 'subscription' ? plan.name === props.pendingPlan : false
  const isUpgrade =
    props.mode === 'subscription' && props.currentPlan
      ? getPlanRank(plan.name) > getPlanRank(props.currentPlan)
      : false

  // ── Button rendering ───────────────────────────────────────────────────────
  let buttonSection: React.ReactNode

  if (props.mode === 'onboarding') {
    buttonSection = (
      <Button
        variant="primary"
        className="w-full"
        onClick={() => props.onSelect(plan.name)}
        disabled={props.disabled}
      >
        {props.submitting ? t('upgrading') : props.chooseLabel}
      </Button>
    )
  } else if (isCurrent) {
    buttonSection = (
      <Button variant="secondary" disabled className="w-full">
        {t('current_badge')}
      </Button>
    )
  } else if (isPending) {
    buttonSection = (
      <div className="space-y-2">
        <p className="text-center text-[13px] text-muted-foreground">
          {t('confirm_switch_title', { plan: plan.displayName })}
        </p>
        <p className="text-center text-xs text-muted-foreground">{t('confirm_switch_body')}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={props.onCancelPending}
            disabled={props.switching}
          >
            {t('confirm_cancel')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={props.onCancelConfirm}
            disabled={props.switching}
          >
            {props.switching ? t('upgrading') : t('confirm_action')}
          </Button>
        </div>
      </div>
    )
  } else if (props.mode === 'subscription' && props.locked) {
    buttonSection = (
      <Button variant="secondary" disabled className="w-full">
        {props.lockedLabel ?? t('not_available')}
      </Button>
    )
  } else {
    buttonSection = (
      <Button
        variant={isUpgrade ? 'primary' : 'secondary'}
        className="w-full"
        onClick={() => props.onSelect(plan.name)}
        disabled={props.switching}
      >
        {isUpgrade ? t('upgrade') : t('downgrade')}
      </Button>
    )
  }

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border p-5 transition-shadow',
        isCurrent
          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
          : 'border-border bg-card hover:shadow-sm',
      )}
    >
      {isCurrent ? (
        <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
          {t('current_badge')}
        </span>
      ) : null}

      <div className="mb-4">
        <div className="text-[15px] font-semibold text-foreground">{plan.displayName}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {isFree
            ? t('price_free')
            : t('price_per_month', { price: plan.priceXAF.toLocaleString() })}
        </div>
      </div>

      <ul className="mb-5 flex-1 space-y-2">
        {quotaItems.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-foreground/80">
            <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />
            {item}
          </li>
        ))}
      </ul>

      {buttonSection}
    </div>
  )
}
