import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DebtDirection, NotificationType } from '@biztrack/types'
import { APP_ROUTES } from '@biztrack/utils'
import { Locale } from '@/common/enums/locale.enum'
import { Business } from '@/entities/business.entity'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
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
// low-stock producer). One shared label/value model renders all three channel formats.
const DIGEST_COPY = {
  [Locale.EN]: {
    locale: 'en-US',
    title: 'Daily summary',
    sep: ': ',
    lblRevenue: 'Revenue',
    lblProfit: 'Profit',
    lblCash: 'Cash variance',
    lblDiscounts: 'Discounts',
    lblStock: 'Stock',
    lblReceivables: 'Receivables',
    noDrawer: 'No drawer closed',
    toReorder: (n: number) => `${n} product${n > 1 ? 's' : ''} to reorder`,
    stockOk: 'All good',
    overdue: (v: string) => `${v} overdue`,
  },
  [Locale.FR]: {
    locale: 'fr-FR',
    title: 'Résumé du jour',
    sep: ' : ',
    lblRevenue: 'Recette',
    lblProfit: 'Bénéfice',
    lblCash: 'Écart caisse',
    lblDiscounts: 'Remises',
    lblStock: 'Stock',
    lblReceivables: 'Créances',
    noDrawer: 'Aucune caisse clôturée',
    toReorder: (n: number) => `${n} produit${n > 1 ? 's' : ''} à commander`,
    stockOk: 'Tout est bon',
    overdue: (v: string) => `${v} en retard`,
  },
} as const

type DigestCopy = (typeof DIGEST_COPY)[Locale]
interface DigestRow {
  label: string
  value: string
}

const businessLang = (business: Business | null): Locale =>
  business?.owner?.language === Locale.EN ? Locale.EN : Locale.FR

/** The business-local day, spelled out in the business language (e.g. "20 August 2026").
 *  Formatted in UTC so the 'YYYY-MM-DD' key keeps its calendar date. */
const formatDay = (dayKey: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dayKey}T00:00:00.000Z`))

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
      receivablesOverdue: ageing.totals.pastDue,
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
    const rows = this.buildRows(copy, figures)

    await this.dispatcher.dispatch({
      businessId,
      event: NotificationType.DAILY_SUMMARY,
      title: `${copy.title} — ${business.name}`,
      body: this.buildInApp(copy, rows),
      emailBody: this.buildEmailHtml(copy, business.name, dayKey, rows),
      whatsappBody: this.buildWhatsApp(copy, business.name, dayKey, rows),
      deeplink: APP_ROUTES.reports(),
      metadata: { dayKey, ...figures },
      urgent: opts.urgent ?? false,
    })
    return figures
  }

  /** One label/value pair per figure — the shared source every channel format renders. */
  private buildRows(copy: DigestCopy, f: DailyDigestFigures): DigestRow[] {
    const n = (v: number) => v.toLocaleString(copy.locale)
    return [
      { label: copy.lblRevenue, value: `${n(f.revenue)} XAF` },
      { label: copy.lblProfit, value: `${n(f.profit)} XAF` },
      {
        label: copy.lblCash,
        value: f.cashShifts > 0 ? `${signed(f.cashVariance, copy.locale)} XAF` : copy.noDrawer,
      },
      { label: copy.lblDiscounts, value: `${n(f.discounts)} XAF` },
      {
        label: copy.lblStock,
        value: f.lowStock > 0 ? copy.toReorder(f.lowStock) : copy.stockOk,
      },
      {
        label: copy.lblReceivables,
        value:
          f.receivablesOverdue > 0
            ? `${n(f.receivablesOutstanding)} XAF (${copy.overdue(n(f.receivablesOverdue))})`
            : `${n(f.receivablesOutstanding)} XAF`,
      },
    ]
  }

  /** Plain "Label: value" lines for the in-app bell (title shown separately by the UI). */
  private buildInApp(copy: DigestCopy, rows: DigestRow[]): string {
    return rows.map((r) => `${r.label}${copy.sep}${r.value}`).join('\n')
  }

  /** WhatsApp: a bold title + date heading, then each value in *bold* for glanceability
   *  (WAHA sends only the body text, so the heading must live here — WhatsApp markdown). */
  private buildWhatsApp(copy: DigestCopy, name: string, dayKey: string, rows: DigestRow[]): string {
    const heading = `📊 *${copy.title} — ${name}*\n${formatDay(dayKey, copy.locale)}`
    const lines = rows.map((r) => `${r.label}${copy.sep}*${r.value}*`).join('\n')
    return `${heading}\n\n${lines}`
  }

  /** HTML for email (Resend renders body as HTML): title + date header, values in a
   *  right-aligned bold column so the numbers read at a glance. */
  private buildEmailHtml(
    copy: DigestCopy,
    name: string,
    dayKey: string,
    rows: DigestRow[],
  ): string {
    const cells = rows
      .map(
        (r) =>
          `<tr><td style="padding:7px 0;color:#555;border-bottom:1px solid #eee">${escapeHtml(
            r.label,
          )}</td><td style="padding:7px 0;text-align:right;font-weight:700;border-bottom:1px solid #eee">${escapeHtml(
            r.value,
          )}</td></tr>`,
      )
      .join('')
    return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:460px">
      <div style="font-size:16px;font-weight:700;margin-bottom:2px">${escapeHtml(copy.title)} — ${escapeHtml(name)}</div>
      <div style="font-size:12px;color:#777;margin-bottom:14px">${escapeHtml(formatDay(dayKey, copy.locale))}</div>
      <table style="border-collapse:collapse;width:100%;font-size:14px">${cells}</table>
    </div>`
  }
}
