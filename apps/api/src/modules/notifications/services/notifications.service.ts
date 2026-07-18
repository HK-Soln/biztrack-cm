import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import type { Queue } from 'bullmq'
import { IsNull, Repository } from 'typeorm'
import type {
  ListNotificationsQuery,
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  NotificationItem,
  UnreadCountResponse,
} from '@biztrack/types'
import { RealtimeService } from '@/modules/realtime/services/realtime.service'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { AppConfig } from '@/config/configuration'
import type { WaitlistEntry } from '@/entities/waitlist-entry.entity'
import type { ContactLead } from '@/entities/contact-lead.entity'
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@/entities/notification.entity'
import {
  NOTIFICATIONS_QUEUE,
  SEND_INVITE_NOTIFICATIONS_JOB,
  SEND_NOTIFICATION_JOB,
  type NotificationJobData,
  type SendInviteNotificationsJobData,
  type SendNotificationJobData,
} from '../constants/notifications.constants'
import { EmailProvider, RESEND_PROVIDER } from '../providers/email.provider'

export interface CreateNotificationOptions {
  channel: NotificationChannel
  type: NotificationType
  recipient: string
  subject?: string
  body: string
  metadata?: Record<string, unknown>
  businessId?: string
  userId?: string
  sender?: string
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepo: Repository<Notification>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private notificationsQueue: Queue<NotificationJobData>,
    @Inject(LOGGER) private logger: Logger,
    private configService: ConfigService<AppConfig>,
    private emailProvider: EmailProvider,
    private realtime: RealtimeService,
  ) {
    this.logger.setContext('NotificationsService')
  }

  /**
   * Persist a single notification record and enqueue a send job.
   * Used for general notifications (OTP, payment reminders, etc.).
   * For invites, use enqueueInviteNotifications instead.
   */
  async createAndEnqueue(opts: CreateNotificationOptions): Promise<Notification> {
    const notification = this.notificationsRepo.create({
      channel: opts.channel,
      type: opts.type,
      recipient: opts.recipient,
      subject: opts.subject ?? null,
      body: opts.body,
      metadata: opts.metadata ?? null,
      businessId: opts.businessId ?? null,
      userId: opts.userId ?? null,
      status: NotificationStatus.PENDING,
      attempts: 0,
      sender: opts.sender ?? null,
    })

    await this.notificationsRepo.save(notification)

    await this.notificationsQueue.add(
      SEND_NOTIFICATION_JOB,
      { notificationId: notification.id } satisfies SendNotificationJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        jobId: `notif-${notification.id}`,
      },
    )

    await this.notificationsRepo.update(notification.id, { status: NotificationStatus.QUEUED })
    notification.status = NotificationStatus.QUEUED

    this.logger.log('Notification enqueued', 'NotificationsService', {
      notificationId: notification.id,
      channel: opts.channel,
      type: opts.type,
    })

    return notification
  }

  /**
   * Enqueue a single job that tells the processor to fan out invite notifications
   * across all available channels (email, SMS, WhatsApp).
   *
   * No DB writes happen here — the processor creates notification records and
   * calls providers entirely asynchronously.
   */
  async enqueueInviteNotifications(
    inviteId: string,
    businessName: string,
    inviterName?: string,
  ): Promise<void> {
    await this.notificationsQueue.add(
      SEND_INVITE_NOTIFICATIONS_JOB,
      { inviteId, businessName, inviterName } satisfies SendInviteNotificationsJobData,
      {
        attempts: 1, // fan-out is one-shot; individual send jobs handle their own retries
        jobId: `invite-notif-${inviteId}`,
      },
    )

    this.logger.log('Invite notifications job enqueued', 'NotificationsService', {
      inviteId,
      businessName,
    })
  }

  /** Update notification to SENT after successful delivery. */
  async markSent(
    notificationId: string,
    providerMessageId?: string,
    provider?: string,
  ): Promise<void> {
    await this.notificationsRepo.update(notificationId, {
      status: NotificationStatus.SENT,
      providerMessageId: providerMessageId ?? null,
      provider: provider ?? null,
      sentAt: new Date(),
    })
  }

  /** Update notification to DELIVERED when provider confirms receipt. */
  async markDelivered(providerMessageId: string, provider: string): Promise<void> {
    const notification = await this.notificationsRepo.findOne({
      where: { providerMessageId, provider },
    })
    if (!notification) return

    await this.notificationsRepo.update(notification.id, {
      status: NotificationStatus.DELIVERED,
    })
  }

  /** Update notification to FAILED after all retries exhausted. */
  async markFailed(notificationId: string, reason: string): Promise<void> {
    await this.notificationsRepo.update(notificationId, {
      status: NotificationStatus.FAILED,
      failedAt: new Date(),
      failureReason: reason,
    })
  }

  /** Mark notification FAILED by provider message ID (e.g. from a webhook). */
  async markFailedByProvider(
    providerMessageId: string,
    reason: string,
    provider: string,
  ): Promise<void> {
    const notification = await this.notificationsRepo.findOne({
      where: { providerMessageId, provider },
    })
    if (!notification) return

    await this.notificationsRepo.update(notification.id, {
      status: NotificationStatus.FAILED,
      failedAt: new Date(),
      failureReason: reason,
    })
  }

  async findById(id: string): Promise<Notification | null> {
    return this.notificationsRepo.findOne({ where: { id } })
  }

  // -------------------------------------------------------------------------
  // In-app notification feed (bell/banner). These are persisted immediately as
  // SENT (delivery is the realtime push, not an outbound provider) and relayed
  // to the recipient's socket room via the app event bus.
  // -------------------------------------------------------------------------

  /** Create an in-app notification for a user and push it to their realtime room. */
  async createInApp(opts: {
    userId: string
    businessId?: string | null
    type: NotificationType
    title: string
    body: string
    deeplink?: string | null
    metadata?: Record<string, unknown> | null
  }): Promise<NotificationItem> {
    const notification = this.notificationsRepo.create({
      channel: NotificationChannel.IN_APP,
      type: opts.type,
      recipient: opts.userId, // recipient is NOT NULL; for in-app it carries the user id
      subject: opts.title,
      body: opts.body,
      deeplink: opts.deeplink ?? null,
      metadata: opts.metadata ?? null,
      businessId: opts.businessId ?? null,
      userId: opts.userId,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      attempts: 0,
    })
    await this.notificationsRepo.save(notification)

    const item = this.toItem(notification)
    const unreadCount = await this.unreadCountValue(opts.userId)
    this.realtime.toUser(opts.userId, 'notification', { notification: item, unreadCount })

    this.logger.log('In-app notification created', 'NotificationsService', {
      notificationId: notification.id,
      userId: opts.userId,
      type: opts.type,
    })
    return item
  }

  async listInApp(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<ListNotificationsResponse> {
    const page = Math.max(1, query.page ?? 1)
    const limit = Math.min(50, Math.max(1, query.limit ?? 20))
    const [rows, total] = await this.notificationsRepo.findAndCount({
      where: { userId, channel: NotificationChannel.IN_APP },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    })
    const unreadCount = await this.unreadCountValue(userId)
    return { items: rows.map((r) => this.toItem(r)), total, page, limit, unreadCount }
  }

  async unreadCount(userId: string): Promise<UnreadCountResponse> {
    return { count: await this.unreadCountValue(userId) }
  }

  async markRead(userId: string, id: string): Promise<MarkNotificationReadResponse> {
    const row = await this.notificationsRepo.findOne({
      where: { id, userId, channel: NotificationChannel.IN_APP },
    })
    if (row && !row.readAt) {
      await this.notificationsRepo.update(row.id, { readAt: new Date() })
    }
    return { id, read: true }
  }

  async markAllRead(userId: string): Promise<MarkAllNotificationsReadResponse> {
    const res = await this.notificationsRepo.update(
      { userId, channel: NotificationChannel.IN_APP, readAt: IsNull() },
      { readAt: new Date() },
    )
    return { updated: res.affected ?? 0 }
  }

  private async unreadCountValue(userId: string): Promise<number> {
    return this.notificationsRepo.count({
      where: { userId, channel: NotificationChannel.IN_APP, readAt: IsNull() },
    })
  }

  private toItem(n: Notification): NotificationItem {
    const created =
      n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt as unknown as string)
    return {
      id: n.id,
      type: n.type,
      title: n.subject ?? '',
      body: n.body,
      deeplink: n.deeplink ?? null,
      read: n.readAt != null,
      createdAt: created.toISOString(),
    }
  }

  /**
   * Forward an inbound email (email.received webhook) to the founder.
   * Fetches the full body from Resend first since the webhook only contains metadata.
   */
  async forwardInboundEmail(data: {
    emailId: string
    from?: string
    subject?: string
  }): Promise<void> {
    const founderEmail = this.configService.get('FOUNDER_EMAIL', { infer: true })
    if (!founderEmail) {
      this.logger.warn(
        'FOUNDER_EMAIL not set — skipping inbound email forward',
        'NotificationsService',
      )
      return
    }

    this.logger.debug('Forwarding inbound email to founder', 'NotificationsService', {
      emailId: data.emailId,
      from: data.from,
      subject: data.subject,
    })

    const content = await this.emailProvider.fetchReceivedEmail(data.emailId)
    if (!content) {
      this.logger.warn(
        'Could not fetch inbound email body — skipping forward',
        'NotificationsService',
        {
          emailId: data.emailId,
        },
      )
      return
    }

    const subject = `[Fwd] ${data.subject ?? content.subject ?? '(no subject)'}`
    const body = content.html ?? content.text ?? ''

    const notification = this.notificationsRepo.create({
      channel: NotificationChannel.EMAIL,
      type: NotificationType.MARKETING,
      recipient: founderEmail,
      subject,
      body,
      status: NotificationStatus.PENDING,
      attempts: 0,
    })
    await this.notificationsRepo.save(notification)

    const result = await this.emailProvider.sendRaw({
      from: this.emailProvider.noReplySender,
      to: founderEmail,
      reply_to: data.from,
      subject,
      html: content.html,
      text: content.text,
    })

    if (result.id) {
      await this.markSent(notification.id, result.id, RESEND_PROVIDER)
    } else {
      await this.markFailed(notification.id, 'Forward failed — no provider message ID returned')
    }
  }

  async incrementAttempts(notificationId: string): Promise<void> {
    await this.notificationsRepo.increment({ id: notificationId }, 'attempts', 1)
  }

  async sendWaitlistNotification(entry: WaitlistEntry): Promise<void> {
    const founderEmail = this.configService.get('FOUNDER_EMAIL', { infer: true })
    if (!founderEmail) {
      this.logger.warn('FOUNDER_EMAIL not set — skipping waitlist email')
      return
    }

    const subject = `🎉 New BizTrack CM waitlist signup — ${entry.name}`

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">BizTrack CM — New waitlist signup</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 24px;color:#F0F7F4">${entry.name} wants access</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:10px 12px;background:#112B20;border-radius:6px 6px 0 0;color:#8FBFAA;width:120px">Name</td><td style="padding:10px 12px;background:#112B20;border-radius:0 6px 0 0;font-weight:500">${entry.name}</td></tr>
          <tr><td style="padding:10px 12px;background:#0D2B1F;color:#8FBFAA">Email</td><td style="padding:10px 12px;background:#0D2B1F"><a href="mailto:${entry.email}" style="color:#1D9E75">${entry.email}</a></td></tr>
          <tr><td style="padding:10px 12px;background:#112B20;color:#8FBFAA">WhatsApp</td><td style="padding:10px 12px;background:#112B20"><a href="https://wa.me/${entry.phone.replace(/\s+/g, '')}" style="color:#1D9E75">${entry.phone}</a></td></tr>
          <tr><td style="padding:10px 12px;background:#0D2B1F;color:#8FBFAA">Language</td><td style="padding:10px 12px;background:#0D2B1F">${entry.locale === 'fr' ? '🇫🇷 French' : '🇬🇧 English'}</td></tr>
          <tr><td style="padding:10px 12px;background:#112B20;color:#8FBFAA">Source</td><td style="padding:10px 12px;background:#112B20">${entry.utm_source ?? '—'} / ${entry.utm_medium ?? '—'}</td></tr>
          <tr><td style="padding:10px 12px;background:#0D2B1F;border-radius:0 0 0 6px;color:#8FBFAA">Signed up</td><td style="padding:10px 12px;background:#0D2B1F;border-radius:0 0 6px 0">${entry.created_at.toLocaleString('en-GB', { timeZone: 'Africa/Douala' })} WAT</td></tr>
        </table>
        ${entry.is_duplicate ? `<div style="margin-top:16px;padding:10px 14px;background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.3);border-radius:8px;color:#F5A623;font-size:13px">⚠ This email address has signed up before.</div>` : ''}
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(29,158,117,.2);font-size:12px;color:#5A8A74">
          <strong style="color:#8FBFAA">Next step:</strong> Contact ${entry.name} on WhatsApp within 48 hours to schedule installation.
          <br><br>Reply-to this email or message directly: <a href="https://wa.me/${entry.phone.replace(/\s+/g, '')}" style="color:#1D9E75">Open WhatsApp →</a>
        </div>
      </div>
    `

    const text = `
New BizTrack CM waitlist signup

Name: ${entry.name}
Email: ${entry.email}
WhatsApp: ${entry.phone}
Language: ${entry.locale}
Signed up: ${entry.created_at.toISOString()}
${entry.is_duplicate ? 'NOTE: Duplicate email address.' : ''}

Next step: contact ${entry.name} on WhatsApp within 48 hours.
    `.trim()

    const isFr = entry.locale !== 'en'

    const confirmSubject = isFr
      ? `✓ Votre demande d'accès BizTrack CM a été reçue`
      : `✓ Your BizTrack CM early access request has been received`

    const confirmHtml = isFr
      ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px">BizTrack CM</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 16px;color:#F0F7F4">Bonjour ${entry.name} 👋</h2>
        <p style="font-size:15px;line-height:1.7;color:#8FBFAA;margin:0 0 20px">
          Merci de vous être inscrit sur la liste d'attente BizTrack CM.<br>
          Nous avons bien reçu votre demande d'accès anticipé.
        </p>
        <div style="background:#112B20;border:1px solid rgba(29,158,117,0.18);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="font-size:13px;color:#5A8A74;margin-bottom:4px">Étape suivante</div>
          <div style="font-size:15px;color:#F0F7F4;font-weight:500">
            Un agent BizTrack CM vous contactera sur WhatsApp (<strong style="color:#1D9E75">${entry.phone}</strong>) dans les 48 heures pour installer l'application gratuitement dans votre boutique.
          </div>
        </div>
        <p style="font-size:13px;color:#5A8A74;line-height:1.6;margin:0 0 8px">
          Des questions ? Écrivez-nous à <a href="mailto:${this.emailProvider.waitingListReplier}" style="color:#1D9E75">${this.emailProvider.waitingListReplier}</a>.
        </p>
        <p style="font-size:13px;color:#5A8A74;margin:0">
          À très bientôt,<br>
          <strong style="color:#8FBFAA">L'équipe BizTrack CM</strong>
        </p>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(29,158,117,0.12);font-size:11px;color:#3A6A54;text-align:center">
          🇨🇲 Fait au Cameroun · Pour le Cameroun · <a href="https://hk-solutions.app" style="color:#1D9E75">biztrack.cm</a>
        </div>
      </div>`
      : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px">BizTrack CM</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 16px;color:#F0F7F4">Hi ${entry.name} 👋</h2>
        <p style="font-size:15px;line-height:1.7;color:#8FBFAA;margin:0 0 20px">
          Thank you for joining the BizTrack CM waitlist.<br>
          We've received your early access request.
        </p>
        <div style="background:#112B20;border:1px solid rgba(29,158,117,0.18);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="font-size:13px;color:#5A8A74;margin-bottom:4px">What happens next</div>
          <div style="font-size:15px;color:#F0F7F4;font-weight:500">
            A BizTrack CM agent will contact you on WhatsApp (<strong style="color:#1D9E75">${entry.phone}</strong>) within 48 hours to install the app for free in your shop.
          </div>
        </div>
        <p style="font-size:13px;color:#5A8A74;line-height:1.6;margin:0 0 8px">
          Questions? Email us at <a href="mailto:${this.emailProvider.waitingListReplier}" style="color:#1D9E75">${this.emailProvider.waitingListReplier}</a>.
        </p>
        <p style="font-size:13px;color:#5A8A74;margin:0">
          See you soon,<br>
          <strong style="color:#8FBFAA">The BizTrack CM team</strong>
        </p>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(29,158,117,0.12);font-size:11px;color:#3A6A54;text-align:center">
          🇨🇲 Made in Cameroon · For Cameroon · <a href="https://hk-solutions.app" style="color:#1D9E75">biztrack.cm</a>
        </div>
      </div>`

    const confirmText = isFr
      ? `Bonjour ${entry.name},\n\nMerci pour votre inscription sur la liste d'attente BizTrack CM.\n\nUn agent vous contactera sur WhatsApp (${entry.phone}) dans les 48 heures.\n\nQuestions ? ${this.emailProvider.waitingListReplier}\n\nL'équipe BizTrack CM`
      : `Hi ${entry.name},\n\nThank you for joining the BizTrack CM waitlist.\n\nAn agent will contact you on WhatsApp (${entry.phone}) within 48 hours.\n\nQuestions? ${this.emailProvider.waitingListReplier}\n\nThe BizTrack CM team`

    // Create notification records so webhook delivery events can be correlated
    const [founderNotif, clientNotif] = await this.notificationsRepo.save([
      this.notificationsRepo.create({
        channel: NotificationChannel.EMAIL,
        type: NotificationType.MARKETING,
        recipient: founderEmail,
        subject,
        body: html,
        status: NotificationStatus.PENDING,
        attempts: 0,
        sender: this.emailProvider.noReplySender,
      }),
      this.notificationsRepo.create({
        channel: NotificationChannel.EMAIL,
        type: NotificationType.MARKETING,
        recipient: entry.email,
        subject: confirmSubject,
        body: confirmHtml,
        status: NotificationStatus.PENDING,
        attempts: 0,
        sender: this.emailProvider.noReplySender,
      }),
    ])

    const [founderResult, clientResult] = await Promise.allSettled([
      this.emailProvider.sendRaw({
        from: founderNotif?.sender ?? this.emailProvider.noReplySender,
        to: founderEmail,
        reply_to: entry.email,
        subject,
        html,
        text,
      }),
      this.emailProvider.sendRaw({
        from: clientNotif?.sender ?? this.emailProvider.noReplySender,
        to: entry.email,
        subject: confirmSubject,
        html: confirmHtml,
        text: confirmText,
      }),
    ])

    if (founderResult.status === 'fulfilled') {
      await this.markSent(founderNotif!.id, founderResult.value.id, RESEND_PROVIDER)
    } else {
      await this.markFailed(founderNotif!.id, String(founderResult.reason))
    }

    if (clientResult.status === 'fulfilled') {
      await this.markSent(clientNotif!.id, clientResult.value.id, RESEND_PROVIDER)
    } else {
      await this.markFailed(clientNotif!.id, String(clientResult.reason))
    }
  }

  /**
   * Contact-form lead: notify the support team (reply-to the lead) and — when the lead left
   * an email — send them a branded acknowledgement. Mirrors sendWaitlistNotification: persist
   * a Notification row per email, send directly via Resend, then mark sent/failed.
   */
  async sendContactLeadNotification(lead: ContactLead): Promise<void> {
    const supportEmail =
      this.configService.get('SUPPORT_EMAIL', { infer: true }) ??
      this.configService.get('FOUNDER_EMAIL', { infer: true })
    if (!supportEmail) {
      this.logger.warn('SUPPORT_EMAIL/FOUNDER_EMAIL not set — skipping contact lead email')
      return
    }

    const when = lead.created_at.toLocaleString('en-GB', { timeZone: 'Africa/Douala' })
    const row = (k: string, v: string, alt = false) =>
      `<tr><td style="padding:10px 12px;background:${alt ? '#0D2B1F' : '#112B20'};color:#8FBFAA;width:130px">${k}</td><td style="padding:10px 12px;background:${alt ? '#0D2B1F' : '#112B20'}">${v}</td></tr>`
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const teamSubject = `📩 New BizTrack CM contact lead — ${lead.name}`
    const teamHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">BizTrack CM — New contact lead</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 24px;color:#F0F7F4">${esc(lead.name)} got in touch</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${row('Name', esc(lead.name))}
          ${lead.business ? row('Business', esc(lead.business), true) : ''}
          ${row('WhatsApp', `<a href="https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}" style="color:#1D9E75">${esc(lead.phone)}</a>`, !lead.business)}
          ${lead.email ? row('Email', `<a href="mailto:${esc(lead.email)}" style="color:#1D9E75">${esc(lead.email)}</a>`) : ''}
          ${lead.city ? row('City', esc(lead.city), true) : ''}
          ${lead.topic ? row('Interested in', esc(lead.topic)) : ''}
          ${row('Language', lead.locale === 'fr' ? '🇫🇷 French' : '🇬🇧 English', true)}
          ${row('Received', `${when} WAT`)}
        </table>
        <div style="margin-top:16px;padding:14px 16px;background:#0D2B1F;border-radius:8px;font-size:14px;line-height:1.6;color:#F0F7F4;white-space:pre-wrap">${esc(lead.message)}</div>
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(29,158,117,.2);font-size:12px;color:#5A8A74">
          <strong style="color:#8FBFAA">Next step:</strong> reply to this email or message ${esc(lead.name)} on <a href="https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}" style="color:#1D9E75">WhatsApp →</a> within one business day.
        </div>
      </div>`
    const teamText = `New BizTrack CM contact lead\n\nName: ${lead.name}\nBusiness: ${lead.business ?? '—'}\nWhatsApp: ${lead.phone}\nEmail: ${lead.email ?? '—'}\nCity: ${lead.city ?? '—'}\nInterested in: ${lead.topic ?? '—'}\nLanguage: ${lead.locale}\nReceived: ${when} WAT\n\nMessage:\n${lead.message}`

    const notifications = [
      this.notificationsRepo.create({
        channel: NotificationChannel.EMAIL,
        type: NotificationType.MARKETING,
        recipient: supportEmail,
        subject: teamSubject,
        body: teamHtml,
        status: NotificationStatus.PENDING,
        attempts: 0,
        sender: this.emailProvider.noReplySender,
      }),
    ]

    const isFr = lead.locale !== 'en'
    const ackSubject = isFr
      ? '✓ Nous avons bien reçu votre message — BizTrack CM'
      : "✓ We've received your message — BizTrack CM"
    const ackHtml = isFr
      ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px">BizTrack CM</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 16px;color:#F0F7F4">Bonjour ${esc(lead.name)} 👋</h2>
        <p style="font-size:15px;line-height:1.7;color:#8FBFAA;margin:0 0 20px">Merci de nous avoir contactés. Nous avons bien reçu votre message et notre équipe vous répondra sous un jour ouvré — souvent bien plus vite sur WhatsApp.</p>
        <div style="background:#112B20;border:1px solid rgba(29,158,117,0.18);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="font-size:13px;color:#5A8A74;margin-bottom:6px">Votre message</div>
          <div style="font-size:14px;color:#F0F7F4;white-space:pre-wrap">${esc(lead.message)}</div>
        </div>
        <p style="font-size:13px;color:#5A8A74;line-height:1.6;margin:0 0 8px">Besoin d'une réponse immédiate ? Écrivez-nous sur WhatsApp au <a href="https://wa.me/971588629213" style="color:#1D9E75">+971 58 862 9213</a> ou à <a href="mailto:${this.emailProvider.generalEnquiriesReplier}" style="color:#1D9E75">${this.emailProvider.generalEnquiriesReplier}</a>.</p>
        <p style="font-size:13px;color:#5A8A74;margin:0">À très bientôt,<br><strong style="color:#8FBFAA">L'équipe BizTrack CM</strong></p>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(29,158,117,0.12);font-size:11px;color:#3A6A54;text-align:center">🇨🇲 Fait au Cameroun · Pour le Cameroun · <a href="https://hk-solutions.app" style="color:#1D9E75">biztrack.cm</a></div>
      </div>`
      : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#06140F;color:#F0F7F4;padding:32px;border-radius:12px">
        <div style="color:#1D9E75;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px">BizTrack CM</div>
        <h2 style="font-size:24px;font-weight:300;margin:0 0 16px;color:#F0F7F4">Hi ${esc(lead.name)} 👋</h2>
        <p style="font-size:15px;line-height:1.7;color:#8FBFAA;margin:0 0 20px">Thanks for reaching out. We've received your message and our team will get back to you within one business day — usually much sooner on WhatsApp.</p>
        <div style="background:#112B20;border:1px solid rgba(29,158,117,0.18);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="font-size:13px;color:#5A8A74;margin-bottom:6px">Your message</div>
          <div style="font-size:14px;color:#F0F7F4;white-space:pre-wrap">${esc(lead.message)}</div>
        </div>
        <p style="font-size:13px;color:#5A8A74;line-height:1.6;margin:0 0 8px">Need a reply now? Message us on WhatsApp at <a href="https://wa.me/971588629213" style="color:#1D9E75">+971 58 862 9213</a> or email <a href="mailto:${this.emailProvider.generalEnquiriesReplier}" style="color:#1D9E75">${this.emailProvider.generalEnquiriesReplier}</a>.</p>
        <p style="font-size:13px;color:#5A8A74;margin:0">Talk soon,<br><strong style="color:#8FBFAA">The BizTrack CM team</strong></p>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(29,158,117,0.12);font-size:11px;color:#3A6A54;text-align:center">🇨🇲 Made in Cameroon · For Cameroon · <a href="https://hk-solutions.app" style="color:#1D9E75">biztrack.cm</a></div>
      </div>`
    const ackText = isFr
      ? `Bonjour ${lead.name},\n\nMerci de nous avoir contactés. Nous avons bien reçu votre message et vous répondrons sous un jour ouvré.\n\nBesoin d'une réponse immédiate ? WhatsApp : +971 58 862 9213\n\nL'équipe BizTrack CM`
      : `Hi ${lead.name},\n\nThanks for reaching out. We've received your message and will get back to you within one business day.\n\nNeed a reply now? WhatsApp: +971 58 862 9213\n\nThe BizTrack CM team`

    if (lead.email) {
      notifications.push(
        this.notificationsRepo.create({
          channel: NotificationChannel.EMAIL,
          type: NotificationType.MARKETING,
          recipient: lead.email,
          subject: ackSubject,
          body: ackHtml,
          status: NotificationStatus.PENDING,
          attempts: 0,
          sender: this.emailProvider.noReplySender,
        }),
      )
    }

    const saved = await this.notificationsRepo.save(notifications)
    const teamNotif = saved[0]!
    const ackNotif = lead.email ? saved[1] : undefined

    const sends: Promise<{ id?: string }>[] = [
      this.emailProvider.sendRaw({
        from: teamNotif.sender ?? this.emailProvider.noReplySender,
        to: supportEmail,
        reply_to: lead.email ?? undefined,
        subject: teamSubject,
        html: teamHtml,
        text: teamText,
      }),
    ]
    if (ackNotif) {
      sends.push(
        this.emailProvider.sendRaw({
          from: ackNotif.sender ?? this.emailProvider.noReplySender,
          to: ackNotif.recipient,
          subject: ackSubject,
          html: ackHtml,
          text: ackText,
        }),
      )
    }

    const results = await Promise.allSettled(sends)
    const teamResult = results[0]!
    if (teamResult.status === 'fulfilled') {
      await this.markSent(teamNotif.id, teamResult.value.id, RESEND_PROVIDER)
    } else {
      await this.markFailed(teamNotif.id, String(teamResult.reason))
    }
    const ackResult = results[1]
    if (ackNotif && ackResult) {
      if (ackResult.status === 'fulfilled') {
        await this.markSent(ackNotif.id, ackResult.value.id, RESEND_PROVIDER)
      } else {
        await this.markFailed(ackNotif.id, String(ackResult.reason))
      }
    }
  }
}
