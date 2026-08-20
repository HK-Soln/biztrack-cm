import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DebtDirection, NotificationType } from '@biztrack/types'
import { APP_ROUTES } from '@biztrack/utils'
import { Locale } from '@/common/enums/locale.enum'
import { Business } from '@/entities/business.entity'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'
import { OpeningBalancesService } from '@/modules/debts/services/opening-balances.service'
import { DEBT_REMINDER_TOP_N } from '../constants/debt-reminders.constants'

interface OverdueDebtor {
  name: string
  amount: number
}
export interface OverdueSummary {
  totalPastDue: number
  count: number
  top: OverdueDebtor[]
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const DEBT_COPY = {
  [Locale.EN]: {
    locale: 'en-US',
    sep: ': ',
    title: 'Debts to follow up',
    summary: (count: number, total: string) =>
      `${count} customer${count > 1 ? 's' : ''} overdue · ${total} XAF`,
    andMore: (n: number) => `+${n} more`,
  },
  [Locale.FR]: {
    locale: 'fr-FR',
    sep: ' : ',
    title: 'Créances à relancer',
    summary: (count: number, total: string) =>
      `${count} client${count > 1 ? 's' : ''} en retard · ${total} XAF`,
    andMore: (n: number) => `+${n} autre${n > 1 ? 's' : ''}`,
  },
} as const

type DebtCopy = (typeof DEBT_COPY)[Locale]

const businessLang = (business: Business | null): Locale =>
  business?.owner?.language === Locale.EN ? Locale.EN : Locale.FR

/**
 * Owner-facing debt-due reminder (BIZ-4.3). Once a day, if a business has receivables
 * strictly past their effective due date (D9), it dispatches a DEBT_DUE reminder naming
 * the biggest debtors so the owner can follow up. Reads the same ageing computation as
 * the reports (OpeningBalancesService), so amounts match; excludes opening balances.
 */
@Injectable()
export class DebtReminderService {
  constructor(
    private readonly openingBalances: OpeningBalancesService,
    private readonly dispatcher: NotificationDispatcher,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {}

  async computeOverdue(businessId: string): Promise<OverdueSummary> {
    const ageing = await this.openingBalances.getAgeingReport(businessId, DebtDirection.RECEIVABLE)
    const overdue = ageing.entries
      .filter((e) => e.pastDue > 0)
      .sort((a, b) => b.pastDue - a.pastDue)
    return {
      totalPastDue: ageing.totals.pastDue,
      count: overdue.length,
      top: overdue
        .slice(0, DEBT_REMINDER_TOP_N)
        .map((e) => ({ name: e.contactName, amount: e.pastDue })),
    }
  }

  /** Compute + dispatch the reminder for a business. Returns the summary, or null when
   *  nothing is overdue (or the business is gone). */
  async runReminder(businessId: string): Promise<OverdueSummary | null> {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: ['owner'],
    })
    if (!business) return null

    const summary = await this.computeOverdue(businessId)
    if (summary.count === 0 || summary.totalPastDue <= 0) return null

    const copy = DEBT_COPY[businessLang(business)]
    await this.dispatcher.dispatch({
      businessId,
      event: NotificationType.DEBT_DUE,
      title: `${copy.title} — ${business.name}`,
      body: this.buildInApp(copy, summary),
      emailBody: this.buildEmailHtml(copy, business.name, summary),
      whatsappBody: this.buildWhatsApp(copy, business.name, summary),
      deeplink: APP_ROUTES.debtors(),
      metadata: { totalPastDue: summary.totalPastDue, count: summary.count },
    })
    return summary
  }

  private lines(copy: DebtCopy, s: OverdueSummary): string[] {
    const n = (v: number) => v.toLocaleString(copy.locale)
    const rows = s.top.map((d) => `${d.name}${copy.sep}${n(d.amount)} XAF`)
    const hidden = s.count - s.top.length
    if (hidden > 0) rows.push(copy.andMore(hidden))
    return rows
  }

  private buildInApp(copy: DebtCopy, s: OverdueSummary): string {
    const n = (v: number) => v.toLocaleString(copy.locale)
    return [copy.summary(s.count, n(s.totalPastDue)), ...this.lines(copy, s)].join('\n')
  }

  private buildWhatsApp(copy: DebtCopy, name: string, s: OverdueSummary): string {
    const n = (v: number) => v.toLocaleString(copy.locale)
    const rows = s.top.map((d) => `${d.name}${copy.sep}*${n(d.amount)} XAF*`)
    const hidden = s.count - s.top.length
    if (hidden > 0) rows.push(copy.andMore(hidden))
    return `💰 *${copy.title} — ${name}*\n${copy.summary(s.count, n(s.totalPastDue))}\n\n${rows.join('\n')}`
  }

  private buildEmailHtml(copy: DebtCopy, name: string, s: OverdueSummary): string {
    const n = (v: number) => v.toLocaleString(copy.locale)
    const cells = s.top
      .map(
        (d) =>
          `<tr><td style="padding:7px 0;color:#555;border-bottom:1px solid #eee">${escapeHtml(
            d.name,
          )}</td><td style="padding:7px 0;text-align:right;font-weight:700;border-bottom:1px solid #eee">${n(
            d.amount,
          )} XAF</td></tr>`,
      )
      .join('')
    const hidden = s.count - s.top.length
    const more =
      hidden > 0
        ? `<div style="font-size:12px;color:#777;margin-top:8px">${escapeHtml(copy.andMore(hidden))}</div>`
        : ''
    return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:460px">
      <div style="font-size:16px;font-weight:700;margin-bottom:2px">${escapeHtml(copy.title)} — ${escapeHtml(name)}</div>
      <div style="font-size:12px;color:#777;margin-bottom:14px">${escapeHtml(copy.summary(s.count, n(s.totalPastDue)))}</div>
      <table style="border-collapse:collapse;width:100%;font-size:14px">${cells}</table>${more}
    </div>`
  }
}
