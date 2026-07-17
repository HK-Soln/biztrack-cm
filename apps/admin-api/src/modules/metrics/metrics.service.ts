import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Business } from '@/entities/read/business.entity'
import { PlanConfig } from '@/entities/read/plan-config.entity'
import { SubscriptionEvent } from '@/entities/read/subscription-event.entity'
import { SupportTicket } from '@/entities/support-ticket.entity'

const REVENUE_CAVEAT =
  'Estimated from subscription state (plan × status), not payments actually collected.'

interface PlanPrice {
  monthly: number
  annual: number
}

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(PlanConfig) private readonly planRepo: Repository<PlanConfig>,
    @InjectRepository(SubscriptionEvent) private readonly eventRepo: Repository<SubscriptionEvent>,
    @InjectRepository(SupportTicket) private readonly ticketRepo: Repository<SupportTicket>,
    private readonly dataSource: DataSource,
  ) {}

  async overview(canViewRevenue: boolean) {
    const now = Date.now()
    const dayAgo = new Date(now - 24 * 3600_000)
    const weekAgo = new Date(now - 7 * 24 * 3600_000)
    const monthAgo = new Date(now - 30 * 24 * 3600_000)

    const [totalBusinesses, newToday, newWeek, newMonth] = await Promise.all([
      this.businessRepo.count(),
      this.countBusinessesSince(dayAgo),
      this.countBusinessesSince(weekAgo),
      this.countBusinessesSince(monthAgo),
    ])

    const [activeToday, activeLast7Days] = await Promise.all([
      this.activeBusinesses(dayAgo),
      this.activeBusinesses(weekAgo),
    ])
    const totalSalesRecorded = await this.rawCount('sales')

    const [openSupportTickets, criticalTickets] = await Promise.all([
      this.ticketRepo.count({
        where: [{ status: 'OPEN' as never }, { status: 'IN_PROGRESS' as never }],
      }),
      this.ticketRepo.count({ where: { severity: 'CRITICAL' as never } }),
    ])
    const syncErrorCount = await this.syncErrorBusinessCount()

    const revenue = canViewRevenue ? await this.revenueSnapshot() : null

    return {
      growth: {
        totalBusinesses,
        newBusinessesToday: newToday,
        newBusinessesThisWeek: newWeek,
        newBusinessesThisMonth: newMonth,
      },
      engagement: { activeToday, activeLast7Days, totalSalesRecorded },
      revenue: revenue
        ? {
            mrr: revenue.mrr,
            trialCount: revenue.trialCount,
            trialConversionRate: revenue.trialConversionRate,
            churnRate: revenue.churnRate,
          }
        : { mrr: null, trialCount: null, trialConversionRate: null, churnRate: null },
      health: {
        openSupportTickets,
        criticalTickets,
        syncErrorCount,
        failedPayments: 0, // no billing ledger yet — see payments (read-only stub)
      },
      revenueVisible: canViewRevenue,
    }
  }

  async revenue(period: '7d' | '30d' | '90d' | '12m') {
    const snap = await this.revenueSnapshot(period)
    return { ...snap, caveat: REVENUE_CAVEAT }
  }

  async breakdown() {
    const prices = await this.planPrices()
    const rows = await this.activeGroupedByPlan()
    const perPlan = rows.map((r) => {
      const price = prices.get(r.plan) ?? { monthly: 0, annual: 0 }
      const revenue = r.rows.reduce((sum, x) => sum + this.monthly(price, x.cycle) * x.count, 0)
      return { plan: r.plan, count: r.rows.reduce((s, x) => s + x.count, 0), revenue }
    })
    const totalRevenue = perPlan.reduce((s, p) => s + p.revenue, 0)
    return {
      caveat: REVENUE_CAVEAT,
      breakdown: perPlan.map((p) => ({
        ...p,
        percentage: totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 1000) / 10 : 0,
      })),
    }
  }

  /**
   * Approximate daily MRR series: cumulative monthly value of businesses by their
   * created_at within the window, assuming each kept its current plan. We do not
   * store historical MRR snapshots, so this is a reconstruction, not a ledger.
   */
  async mrrHistory(period: '7d' | '30d' | '90d' | '12m') {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
    const prices = await this.planPrices()
    const businesses = await this.businessRepo
      .createQueryBuilder('b')
      .select(['b.plan AS plan', 'b.billing_cycle AS cycle', 'b.created_at AS created_at'])
      .where('b.deleted_at IS NULL')
      .andWhere("b.subscription_status = 'ACTIVE'")
      .getRawMany<{ plan: string; cycle: string; created_at: string }>()

    const points: { date: string; mrr: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 24 * 3600_000)
      const iso = day.toISOString().slice(0, 10)
      const mrr = businesses
        .filter((b) => new Date(b.created_at) <= day)
        .reduce(
          (sum, b) => sum + this.monthly(prices.get(b.plan) ?? { monthly: 0, annual: 0 }, b.cycle),
          0,
        )
      points.push({ date: iso, mrr: Math.round(mrr) })
    }
    return { caveat: REVENUE_CAVEAT, points }
  }

  // ---- internals -----------------------------------------------------------

  private async revenueSnapshot(period: '7d' | '30d' | '90d' | '12m' = '30d') {
    const prices = await this.planPrices()
    const grouped = await this.activeGroupedByPlan()
    let mrr = 0
    let activeSubscribers = 0
    for (const g of grouped) {
      const price = prices.get(g.plan) ?? { monthly: 0, annual: 0 }
      for (const x of g.rows) {
        mrr += this.monthly(price, x.cycle) * x.count
        if (g.plan !== 'FREE') activeSubscribers += x.count
      }
    }
    const trialCount = await this.businessRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere("b.subscription_status = 'TRIAL'")
      .getCount()

    const since = this.periodStart(period)
    const [trialStarts, conversions, cancellations] = await Promise.all([
      this.countEvents('TRIAL_STARTED', since),
      this.countEvents('PLAN_SELECTED', since),
      this.countEvents('CANCELLED', since),
    ])
    const trialConversionRate =
      trialStarts > 0 ? Math.round((conversions / trialStarts) * 1000) / 10 : 0
    const churnRate =
      activeSubscribers > 0 ? Math.round((cancellations / activeSubscribers) * 1000) / 10 : 0

    return {
      period,
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      arpu: activeSubscribers > 0 ? Math.round(mrr / activeSubscribers) : 0,
      activeSubscribers,
      trialCount,
      trialConversionRate,
      churnRate,
    }
  }

  private monthly(price: PlanPrice, cycle: string): number {
    return cycle === 'ANNUAL' ? price.annual / 12 : price.monthly
  }

  private async planPrices(): Promise<Map<string, PlanPrice>> {
    const configs = await this.planRepo.find()
    return new Map(configs.map((c) => [c.plan, { monthly: c.priceXAF, annual: c.priceAnnualXAF }]))
  }

  private async activeGroupedByPlan(): Promise<
    { plan: string; rows: { cycle: string; count: number }[] }[]
  > {
    const raw = await this.businessRepo
      .createQueryBuilder('b')
      .select('b.plan', 'plan')
      .addSelect('b.billing_cycle', 'cycle')
      .addSelect('COUNT(*)', 'count')
      .where('b.deleted_at IS NULL')
      .andWhere("b.subscription_status = 'ACTIVE'")
      .groupBy('b.plan')
      .addGroupBy('b.billing_cycle')
      .getRawMany<{ plan: string; cycle: string; count: string }>()

    const byPlan = new Map<string, { cycle: string; count: number }[]>()
    for (const r of raw) {
      const list = byPlan.get(r.plan) ?? []
      list.push({ cycle: r.cycle, count: Number(r.count) })
      byPlan.set(r.plan, list)
    }
    return [...byPlan.entries()].map(([plan, rows]) => ({ plan, rows }))
  }

  private countBusinessesSince(since: Date): Promise<number> {
    return this.businessRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere('b.created_at >= :since', { since })
      .getCount()
  }

  private async activeBusinesses(since: Date): Promise<number> {
    // Proxy for activity: distinct businesses that ran a sync batch in the window.
    const row = await this.dataSource
      .query(
        'SELECT COUNT(DISTINCT business_id)::int AS c FROM sync_batches WHERE created_at >= $1',
        [since],
      )
      .catch(() => [{ c: 0 }])
    return row?.[0]?.c ?? 0
  }

  private async syncErrorBusinessCount(): Promise<number> {
    const row = await this.dataSource
      .query(
        'SELECT COUNT(DISTINCT business_id)::int AS c FROM sync_batches WHERE failed_count > 0 AND deleted_at IS NULL',
      )
      .catch(() => [{ c: 0 }])
    return row?.[0]?.c ?? 0
  }

  private async rawCount(table: string): Promise<number> {
    const row = await this.dataSource
      .query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE deleted_at IS NULL`)
      .catch(() => [{ c: 0 }])
    return row?.[0]?.c ?? 0
  }

  private countEvents(event: string, since: Date): Promise<number> {
    return this.eventRepo
      .createQueryBuilder('e')
      .where('e.event = :event', { event })
      .andWhere('e.created_at >= :since', { since })
      .getCount()
  }

  private periodStart(period: '7d' | '30d' | '90d' | '12m'): Date {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
    return new Date(Date.now() - days * 24 * 3600_000)
  }
}
