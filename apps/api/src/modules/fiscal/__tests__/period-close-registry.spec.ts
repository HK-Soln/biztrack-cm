import { CloseStepRegistry } from '@/modules/modules/close-step-registry.service'
import type { PeriodCloseContext, PeriodCloseStep } from '../period-close'

// BIZ-5.5 — the close-step registration seam. A feature module registers a step; the close pipeline
// reads them all. Ships empty (a micro shop's close runs nothing); duplicate keys are rejected.

const stubStep = (key: string): PeriodCloseStep => ({
  key,
  run: async (_ctx: PeriodCloseContext) => ({ ran: key }),
})

describe('CloseStepRegistry', () => {
  it('is empty until a module registers a step', () => {
    expect(new CloseStepRegistry().all()).toEqual([])
  })

  it('collects every registered step, and each runs', async () => {
    const registry = new CloseStepRegistry()
    registry.register(stubStep('a'))
    registry.register(stubStep('b'))

    const steps = registry.all()
    expect(steps.map((s) => s.key)).toEqual(['a', 'b'])
    await expect(steps[0]!.run({} as PeriodCloseContext)).resolves.toEqual({ ran: 'a' })
  })

  it('rejects a duplicate step key (its identity in period_close_runs)', () => {
    const registry = new CloseStepRegistry()
    registry.register(stubStep('dep'))
    expect(() => registry.register(stubStep('dep'))).toThrow(/Duplicate/)
  })
})
