import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DEFAULT_NOTIFICATION_TIMEZONE, DebtDirection, NotificationType } from '@biztrack/types'
import { AppForbiddenException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { Locale } from '@/common/enums/locale.enum'
import { dayKeyInTimezone } from '@/common/time/timezone.util'
import { Business } from '@/entities/business.entity'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { NotificationSetting } from '@/entities/notification-setting.entity'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'
import { SalesService } from '@/modules/sales/services/sales.service'
import { CashSessionsService } from '@/modules/cash-sessions/services/cash-sessions.service'
import { InventoryService } from '@/modules/inventory/services/inventory.service'
import { OpeningBalancesService } from '@/modules/debts/services/opening-balances.service'

/** The owner's end-of-day recap numbers for one business + one business-local day. */
export interface DailyDigestFigures {
  /** Σ sale_items.line_total for COMPLETED sales (Income-Statement revenue basis, D7). */
  revenue: number
  /** revenue − COGS (D7). */
  profit: number
  /** Total discounts given (from the canonical daily_sale_summaries row). */
  discounts: number
  /** Closed+open cash shifts on the day (0 → "no drawer closed"). */
  cashShifts: number
  /** Net counted-vs-expected cash variance across the day's shifts. */
  cashVariance: number
  /** Products currently at/below their reorder threshold. */
  lowStock: number
  /** Total receivables outstanding (all ages, incl. opening balances). */
  receivablesOutstanding: number
  /** Receivables past their due window (> 30 days). */
  receivablesOverdue: number
}

const signed = (v: number, locale: string): string =>
  `${v >= 0 ? '+' : '-'}${Math.abs(v).toLocaleString(locale)}`

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Digest copy per business language (the owner's user.language). Producer-specific, so
// kept inline rather than in the auto-regenerated i18n.generated.ts (matches the
// low-stock producer). Each builder returns one line; the body joins them.
const DIGEST_COPY = {
  [Locale.EN]: {
    numberLocale: 'en-US',
    title: (name: string) => `Daily summary — ${name}`,
    revenue: (v: string) => `Revenue: ${v} XAF`,
    profit: (v: string) => `Profit: ${v} XAF`,
    variance: (v: string) => `Cash variance: ${v} XAF`,
    noCash: 'No cash drawer was closed today.',
    discounts: (v: string) => `Discounts: ${v} XAF`,
    lowStock: (n: number) => `${n} product${n > 1 ? 's' : ''} to reorder`,
    lowStockNone: 'Stock levels OK',
    receivables: (out: string, over: string) => `Receivables: ${out} XAF (${over} overdue)`,
  },
  [Locale.FR]: {
    numberLocale: 'fr-FR',
    title: (name: string) => `Résumé du jour — ${name}`,
    revenue: (v: string) => `Recette : ${v} XAF`,
    profit: (v: string) => `Bénéfice : ${v} XAF`,
    variance: (v: string) => `Écart caisse : ${v} XAF`,
    noCash: 'Aucune caisse clôturée aujourd’hui.',
    discounts: (v: string) => `Remises : ${v} XAF`,
    lowStock: (n: number) => `${n} produit${n > 1 ? 's' : ''} à commander`,
    lowStockNone: 'Niveaux de stock OK',
    receivables: (out: string, over: string) => `Créances : ${out} XAF (${over} en retard)`,
  },
} as const

type DigestCopy = (typeof DIGEST_COPY)[Locale]

const businessLang = (business: Business | null): Locale =>
  business?.owner?.language === Locale.EN ? Locale.EN : Locale.FR

/**
 * Owner daily-summary digest. Computes the figures from the SAME canonical services the
 * reports use (so the digest never disagrees with the on-screen numbers), renders a
 * localized body once as plain text (in-app + WhatsApp) and once as HTML (email, since
 * Resend renders the body as HTML), and dispatches through the notification control plane.
 *
 * The day is identified by a business-local 'YYYY-MM-DD' key. Sales/summaries are
 * UTC-dated; because the digest fires near closing time the local and UTC dates coincide
 * for the sale window, matching the reports' UTC-day basis.
 */
@Injectable()
export class DailyDigestService {
  constructor(
    private readonly sales: SalesService,
    private readonly cashSessions: CashSessionsService,
    private readonly inventory: InventoryService,
    private readonly openingBalances: OpeningBalancesService,
    private readonly dispatcher: NotificationDispatcher,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(NotificationSetting)
    private readonly settingRepo: Repository<NotificationSetting>,
    @InjectRepository(DailySaleSummary)
    private readonly summaryRepo: Repository<DailySaleSummary>,
  ) {}

  async computeFigures(businessId: string, dayKey: string): Promise<DailyDigestFigures> {
    const dayStart = `${dayKey}T00:00:00.000Z`
    const dayEnd = new Date(new Date(dayStart).getTime() + 86_400_000).toISOString()

    const [gp, cash, stats, ageing, summary] = await Promise.all([
      this.sales.getGrossProfit(businessId, { dateFrom: dayKey, dateTo: dayKey }),
      this.cashSessions.dailyReport(businessId, { fromIso: dayStart, toIso: dayEnd }),
      this.inventory.getStats(businessId),
      this.openingBalances.getAgeingReport(businessId, DebtDirection.RECEIVABLE),
      this.summaryRepo.findOne({ where: { businessId, summaryDate: dayKey } }),
    ])

    return {
      revenue: gp.revenue,
      profit: gp.revenue - gp.cogs,
      discounts: summary?.totalDiscounts ?? 0,
      cashShifts: cash.totals.shifts,
      cashVariance: cash.totals.varianceCash,
      lowStock: stats.lowStock,
      receivablesOutstanding: ageing.totals.totalOutstanding,
      receivablesOverdue: ageing.totals.overdue,
    }
  }

  /** Compute + render + dispatch the digest for a business on a business-local day.
   *  Returns the figures, or null if the business no longer exists. */
  async runDigest(
    businessId: string,
    dayKey: string,
    opts: { urgent?: boolean } = {},
  ): Promise<DailyDigestFigures | null> {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: ['owner'],
    })
    if (!business) return null

    const copy = DIGEST_COPY[businessLang(business)]
    const figures = await this.computeFigures(businessId, dayKey)

    await this.dispatcher.dispatch({
      businessId,
      event: NotificationType.DAILY_SUMMARY,
      title: copy.title(business.name),
      body: this.buildBody(copy, figures),
      emailBody: this.buildEmailHtml(copy, figures),
      deeplink: '/reports',
      metadata: { dayKey, ...figures },
      urgent: opts.urgent ?? false,
    })
    return figures
  }

  /** Owner-triggered preview: send today's digest immediately (bypasses quiet hours) so
   *  the owner can see how it renders on each channel. Honours the matrix + recipients —
   *  it's the real message, not a mock. */
  async sendTestDigest(businessId: string, userId: string): Promise<DailyDigestFigures> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } })
    if (!business) throw new AppNotFoundException('Business not found', 'BUSINESS_NOT_FOUND')
    if (business.ownerId !== userId) {
      throw new AppForbiddenException('Only the owner can send a test digest', 'FORBIDDEN')
    }
    const setting = await this.settingRepo.findOne({ where: { businessId } })
    const tz = setting?.timezone || DEFAULT_NOTIFICATION_TIMEZONE
    const dayKey = dayKeyInTimezone(new Date(), tz)
    const figures = await this.runDigest(businessId, dayKey, { urgent: true })
    return figures ?? this.computeFigures(businessId, dayKey)
  }

  private buildLines(copy: DigestCopy, f: DailyDigestFigures): string[] {
    const n = (v: number) => v.toLocaleString(copy.numberLocale)
    return [
      copy.revenue(n(f.revenue)),
      copy.profit(n(f.profit)),
      f.cashShifts > 0 ? copy.variance(signed(f.cashVariance, copy.numberLocale)) : copy.noCash,
      copy.discounts(n(f.discounts)),
      f.lowStock > 0 ? copy.lowStock(f.lowStock) : copy.lowStockNone,
      copy.receivables(n(f.receivablesOutstanding), n(f.receivablesOverdue)),
    ]
  }

  /** Plain text for in-app + WhatsApp (newlines preserved by those channels). */
  private buildBody(copy: DigestCopy, f: DailyDigestFigures): string {
    return this.buildLines(copy, f).join('\n')
  }

  /** HTML for email (Resend renders body as HTML; the plain body's newlines would collapse). */
  private buildEmailHtml(copy: DigestCopy, f: DailyDigestFigures): string {
    const inner = this.buildLines(copy, f).map(escapeHtml).join('<br>')
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#111">${inner}</div>`
  }
}
