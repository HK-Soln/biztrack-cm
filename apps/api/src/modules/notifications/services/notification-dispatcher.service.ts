import { Inject, Injectable } from '@nestjs/common'
import { NotificationChannel, type NotificationEvent } from '@biztrack/types'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { minutesOfDayInTimezone } from '@/common/time/timezone.util'
import { NotificationsService } from './notifications.service'
import { NotificationSettingsService } from './notification-settings.service'

export interface DispatchNotificationInput {
  businessId: string
  event: NotificationEvent
  /** In-app/email subject line. */
  title: string
  body: string
  /** Optional HTML body for the EMAIL channel (Resend renders `body` as HTML, so a
   * plain-text `body` with newlines collapses). In-app keeps the plain `body`. */
  emailBody?: string
  /** Optional body for the WhatsApp channel (supports WhatsApp markdown *bold*); falls
   * back to `body`. Lets a producer add a bold title/heading WhatsApp won't get from the
   * `title` field (WAHA sends only the message text). */
  whatsappBody?: string
  /** In-app deep link the bell navigates to. */
  deeplink?: string | null
  metadata?: Record<string, unknown> | null
  /** Urgent notifications bypass quiet hours (e.g. billing PAST_DUE). */
  urgent?: boolean
}

/**
 * The one place every notification producer routes through (BIZ notifications). Reads
 * the business's preferences and fans a single logical event out to the right people
 * on the right channels:
 *
 *   channels = matrix(event) ∩ recipient-subscription ∩ verified destinations
 *
 * In-app is delivered immediately (it's just a realtime push + a bell row). Email and
 * WhatsApp are enqueued through the existing send pipeline (providers + retries). SMS
 * is never sent while it is WAHA-backed (N3). During quiet hours, non-urgent external
 * channels are held — the in-app row is still recorded, so nothing is lost.
 */
@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly settings: NotificationSettingsService,
    private readonly notifications: NotificationsService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async dispatch(input: DispatchNotificationInput): Promise<void> {
    const plan = await this.settings.resolvePlan(input.businessId, input.event)
    const channels = new Set(plan.channels)
    const holdExternal =
      !input.urgent && plan.quietHours.enabled && withinQuietHours(plan.quietHours)
    const metadata = input.metadata ?? undefined

    let inApp = 0
    let external = 0
    for (const r of plan.recipients) {
      if (channels.has(NotificationChannel.IN_APP) && r.userId) {
        await this.notifications.createInApp({
          userId: r.userId,
          businessId: input.businessId,
          type: input.event,
          title: input.title,
          body: input.body,
          deeplink: input.deeplink ?? null,
          metadata: input.metadata ?? null,
        })
        inApp++
      }

      if (holdExternal) continue

      if (channels.has(NotificationChannel.EMAIL) && r.email) {
        await this.notifications.createAndEnqueue({
          channel: NotificationChannel.EMAIL,
          type: input.event,
          recipient: r.email,
          subject: input.title,
          body: input.emailBody ?? input.body,
          metadata,
          businessId: input.businessId,
          userId: r.userId ?? undefined,
        })
        external++
      }

      if (channels.has(NotificationChannel.WHATSAPP) && r.whatsappContact) {
        await this.notifications.createAndEnqueue({
          channel: NotificationChannel.WHATSAPP,
          type: input.event,
          recipient: r.whatsappContact,
          subject: input.title,
          body: input.whatsappBody ?? input.body,
          metadata,
          businessId: input.businessId,
          userId: r.userId ?? undefined,
        })
        external++
      }
      // SMS intentionally omitted — no live provider (N3).
    }

    this.logger.log('Notification dispatched', 'NotificationDispatcher', {
      businessId: input.businessId,
      event: input.event,
      recipients: plan.recipients.length,
      inApp,
      external,
      heldForQuietHours: holdExternal,
    })
  }
}

/** True when `now` falls inside the quiet window IN THE BUSINESS TIMEZONE, wrap-around
 * aware. The server can be in any region, so quiet hours must be evaluated in the
 * business's own zone, not the server's. */
export function withinQuietHours(
  quiet: { from: string; until: string; timezone?: string },
  now: Date = new Date(),
): boolean {
  const cur = minutesOfDayInTimezone(now, quiet.timezone)
  const from = toMinutes(quiet.from)
  const until = toMinutes(quiet.until)
  if (from === until) return false
  return from < until ? cur >= from && cur < until : cur >= from || cur < until
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
