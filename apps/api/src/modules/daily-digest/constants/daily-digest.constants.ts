export const DAILY_DIGEST_QUEUE = 'daily-digest'

/** Repeatable "tick": scans every business whose close-time+offset has just passed. */
export const DAILY_DIGEST_SCAN_JOB = 'daily-digest-scan'
/** Per-business fan-out job: computes the figures + dispatches the summary. */
export const DAILY_DIGEST_DISPATCH_JOB = 'daily-digest-dispatch'

/**
 * The tick runs every 15 min (server tz irrelevant — each business's send time is
 * evaluated in its own zone). A business is due when now(businessTz) has reached that
 * weekday's close-time + the configured offset, and it hasn't been sent today.
 */
export const DAILY_DIGEST_TICK_CRON_PATTERN = '*/15 * * * *'

/** How long a "sent today" marker is retained (> 24h so it survives the whole day). */
export const DAILY_DIGEST_SENT_TTL_SECONDS = 26 * 60 * 60

export interface DailyDigestScanJobData {
  requestedAt: string
  triggeredBy: 'scheduler'
}

export interface DailyDigestDispatchJobData {
  businessId: string
  /** The business-local day the digest reports on ('YYYY-MM-DD'). */
  dayKey: string
  requestedAt: string
}
