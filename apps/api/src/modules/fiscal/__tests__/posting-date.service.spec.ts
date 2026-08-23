import { PeriodStatus } from '@biztrack/types'
import { PostingDateService } from '../posting-date.service'
import type { AccountingPeriod } from '@/entities/accounting-period.entity'

// A repo stub whose createQueryBuilder returns each queued getOne() result in order — the service
// queries the owning period first, then (only if closed) the earliest open target.
function repoReturning(...results: Array<Partial<AccountingPeriod> | null>) {
  const queue = [...results]
  const qb = {
    where: () => qb,
    andWhere: () => qb,
    orderBy: () => qb,
    getOne: async () => queue.shift() ?? null,
  }
  return { createQueryBuilder: () => qb } as never
}

function make(...results: Array<Partial<AccountingPeriod> | null>) {
  return new PostingDateService(repoReturning(...results))
}

const period = (over: Partial<AccountingPeriod>): Partial<AccountingPeriod> => ({
  id: 'p',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  status: PeriodStatus.OPEN,
  ...over,
})

describe('PostingDateService.resolve', () => {
  it('posts on its own day when the owning period is OPEN', async () => {
    const svc = make(period({ status: PeriodStatus.OPEN }))
    const r = await svc.resolve('b', '2026-01-15')
    expect(r).toEqual({ postingDate: '2026-01-15', isLateArrival: false, originalPeriodId: null })
  })

  it('posts on its own day when there is no fiscal calendar for that day', async () => {
    const svc = make(null)
    const r = await svc.resolve('b', '2030-06-01')
    expect(r).toEqual({ postingDate: '2030-06-01', isLateArrival: false, originalPeriodId: null })
  })

  it('redates a late arrival forward to the earliest open period when its period is CLOSED', async () => {
    const svc = make(
      period({ id: 'jan', status: PeriodStatus.CLOSED, endDate: '2026-01-31' }),
      period({
        id: 'mar',
        status: PeriodStatus.OPEN,
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      }),
    )
    const r = await svc.resolve('b', '2026-01-20')
    expect(r).toEqual({ postingDate: '2026-03-01', isLateArrival: true, originalPeriodId: 'jan' })
  })

  it('treats a LOCKED owning period the same as CLOSED (redates forward)', async () => {
    const svc = make(
      period({ id: 'jan', status: PeriodStatus.LOCKED }),
      period({
        id: 'feb',
        status: PeriodStatus.OPEN,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      }),
    )
    const r = await svc.resolve('b', '2026-01-20')
    expect(r).toEqual({ postingDate: '2026-02-01', isLateArrival: true, originalPeriodId: 'jan' })
  })

  it('degrades to its own day (no flag) when the period is closed and nothing open follows', async () => {
    const svc = make(period({ id: 'jan', status: PeriodStatus.CLOSED }), null)
    const r = await svc.resolve('b', '2026-01-20')
    expect(r).toEqual({ postingDate: '2026-01-20', isLateArrival: false, originalPeriodId: null })
  })
})
