import { Injectable } from '@nestjs/common'
import type { PeriodCloseStep } from '@/modules/fiscal/period-close'

/**
 * BIZ-5.5 — the period-close registration seam. A feature module (Fixed Assets, etc.) injects this
 * global registry and calls `register(step)` in its `onModuleInit`; the close pipeline
 * (FiscalPeriodsService) reads `all()` when a period closes. Ships empty, so a micro shop's close
 * runs nothing. Registration replaces surgery on the close code.
 *
 * Registration happens at boot (module init); closing happens per request — so `all()` is always
 * fully populated by the time it is read. Duplicate keys are rejected (a step's `key` is its
 * identity in period_close_runs).
 */
@Injectable()
export class CloseStepRegistry {
  private readonly steps: PeriodCloseStep[] = []

  register(step: PeriodCloseStep): void {
    if (this.steps.some((s) => s.key === step.key)) {
      throw new Error(`Duplicate period-close step key: ${step.key}`)
    }
    this.steps.push(step)
  }

  all(): readonly PeriodCloseStep[] {
    return this.steps
  }
}
