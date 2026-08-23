import type { AccountingPeriod } from '@/entities/accounting-period.entity'

// BIZ-5.3 — the period-close pipeline contract. The pipeline ships with ZERO registered steps: a
// micro shop's close runs an empty pipeline and costs nothing. The value is that a later module
// (Fixed Assets → depreciation, etc.) becomes a REGISTRATION rather than surgery on the close code.

export interface PeriodCloseContext {
  businessId: string
  period: AccountingPeriod
  /** The period's close_version — the idempotency scope for this close attempt. */
  closeVersion: number
}

/**
 * A unit of work run when an accounting period closes. Every step MUST be idempotent and carry a
 * stable `key` (its identity in period_close_runs, unique per period + close_version), so a close
 * retried after a crash re-runs only the steps that hadn't completed.
 */
export interface PeriodCloseStep {
  readonly key: string
  run(ctx: PeriodCloseContext): Promise<Record<string, unknown> | void>
}

/** DI token for the (initially empty) ordered list of close steps. */
export const PERIOD_CLOSE_STEPS = 'PERIOD_CLOSE_STEPS'
