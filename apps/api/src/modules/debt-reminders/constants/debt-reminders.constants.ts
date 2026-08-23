export const DEBT_REMINDER_QUEUE = 'debt-reminders'

/** Daily scan: fan out a reminder job per business with past-due receivables. */
export const DEBT_REMINDER_SCAN_JOB = 'debt-reminder-scan'
/** Per-business job: compute overdue receivables + dispatch the DEBT_DUE reminder. */
export const DEBT_REMINDER_DISPATCH_JOB = 'debt-reminder-dispatch'

/** Once a day at 08:00 (business-country tz). "Overdue" is date-based, so a fixed daily
 * scan is enough — no per-business send-time like the daily digest. */
export const DEBT_REMINDER_CRON_PATTERN = '0 8 * * *'
export const DEBT_REMINDER_TIMEZONE = 'Africa/Douala'

/** Retain the "sent today" marker > 24h so a business is reminded at most once per day. */
export const DEBT_REMINDER_SENT_TTL_SECONDS = 26 * 60 * 60

/** How many top debtors to name in the reminder body. */
export const DEBT_REMINDER_TOP_N = 5

export interface DebtReminderScanJobData {
  requestedAt: string
  triggeredBy: 'scheduler'
}

export interface DebtReminderDispatchJobData {
  businessId: string
  /** The scan day ('YYYY-MM-DD', business-country tz) — for once-per-day idempotency. */
  dayKey: string
  requestedAt: string
}
