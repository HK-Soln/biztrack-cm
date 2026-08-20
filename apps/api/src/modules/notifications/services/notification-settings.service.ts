import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  BusinessMemberRole,
  BusinessMemberStatus,
  DEFAULT_DAILY_DIGEST_OFFSET_MINUTES,
  DEFAULT_NOTIFICATION_TIMEZONE,
  MANDATORY_NOTIFICATION_EVENTS,
  clampDailyDigestOffset,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NotificationChannel,
  NotificationType,
  UNAVAILABLE_NOTIFICATION_CHANNELS,
  isNotificationChannelAvailable,
  type NotificationEvent,
  type NotificationRecipient as NotificationRecipientModel,
  type NotificationRecipientLookupResult,
  type NotificationSettings,
} from '@biztrack/types'
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { User } from '@/entities/user.entity'
import { NotificationRecipient } from '@/entities/notification-recipient.entity'
import { NotificationSetting } from '@/entities/notification-setting.entity'
import type {
  AddNotificationRecipientDto,
  UpdateNotificationMatrixDto,
  UpdateNotificationRecipientDto,
  UpdateQuietHoursDto,
  UpdateRecipientSubscriptionsDto,
} from '../dto/notification-settings.dto'

/** Resolved routing for one event, as the dispatcher needs it. */
export interface NotificationDispatchPlan {
  /** Matrix-enabled channels for the event (SMS already excluded). */
  channels: NotificationChannel[]
  quietHours: { enabled: boolean; from: string; until: string; timezone: string }
  /** Recipients subscribed to the event, with their resolved destinations. */
  recipients: Array<{
    userId: string | null
    email: string | null
    whatsappContact: string | null
  }>
}

/** Default enabled channels per event — mirrors the Settings preview, with SMS
 * dropped everywhere (no live SMS provider, N3). */
const DEFAULT_ENABLED: Record<NotificationEvent, NotificationChannel[]> = {
  [NotificationType.LOW_STOCK]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  [NotificationType.NEW_ORDER]: [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
    NotificationChannel.WHATSAPP,
  ],
  [NotificationType.PAYMENT_RECEIVED]: [NotificationChannel.IN_APP],
  [NotificationType.DEBT_DUE]: [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
    NotificationChannel.WHATSAPP,
  ],
  [NotificationType.DAILY_SUMMARY]: [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
    NotificationChannel.WHATSAPP,
  ],
  [NotificationType.TEAM_ACTIVITY]: [NotificationChannel.IN_APP],
  [NotificationType.BILLING]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
}

interface OwnerContext {
  ownerId: string | null
  ownerUser: User | null
  business: Business | null
}

/**
 * The Settings → Notifications control plane: the business-level event×channel matrix,
 * quiet hours, and an owner-curated recipient list (each with per-event subscriptions).
 * Owner-only. The dispatcher (and every producer through it) reads these before fanning
 * a notification out.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(
    @InjectRepository(NotificationSetting)
    private readonly settingsRepo: Repository<NotificationSetting>,
    @InjectRepository(NotificationRecipient)
    private readonly recipientsRepo: Repository<NotificationRecipient>,
    @InjectRepository(BusinessMember)
    private readonly membersRepo: Repository<BusinessMember>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  /** Load (reconciling defaults + the owner recipient) the full settings payload. Owner-only. */
  async getSettings(businessId: string, userId: string): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const ctx = await this.ownerContext(businessId)
    const setting = await this.ensureSettings(businessId)
    await this.ensureOwnerRecipient(businessId, ctx)
    return this.toResponse(businessId, setting, ctx.ownerId)
  }

  /** The IANA timezone list for the settings picker — served from the runtime's tz
   * database (Intl), so it stays current without a hardcoded list or an external API. */
  listTimezones(): string[] {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    return intl.supportedValuesOf?.('timeZone') ?? [DEFAULT_NOTIFICATION_TIMEZONE]
  }

  /** Upsert matrix cells. SMS is always forced off regardless of the request (N3). */
  async updateMatrix(
    businessId: string,
    userId: string,
    dto: UpdateNotificationMatrixDto,
  ): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const setting = await this.ensureSettings(businessId)
    const matrix = setting.matrix ?? {}
    for (const t of dto.toggles) {
      if (!NOTIFICATION_EVENTS.includes(t.event as NotificationEvent)) continue
      if (!NOTIFICATION_CHANNELS.includes(t.channel)) continue
      const row = (matrix[t.event] ??= {})
      row[t.channel] = isNotificationChannelAvailable(t.channel) ? t.enabled : false
    }
    setting.matrix = matrix
    // Mandatory events (billing) are high-priority and must keep at least one channel.
    // Reject an update that would silence one entirely — only for events this request
    // actually touched, so unrelated toggles are never blocked.
    const touchedMandatory = new Set(
      dto.toggles
        .map((t) => t.event as NotificationEvent)
        .filter((e) => MANDATORY_NOTIFICATION_EVENTS.includes(e)),
    )
    for (const event of touchedMandatory) {
      const hasOne = NOTIFICATION_CHANNELS.some((ch) => this.matrixCell(setting, event, ch))
      if (!hasOne) {
        throw new AppBadRequestException(
          'This notification must keep at least one channel enabled',
          'NOTIF_CHANNEL_REQUIRED',
        )
      }
    }
    await this.settingsRepo.save(setting)
    return this.getSettings(businessId, userId)
  }

  async updateQuietHours(
    businessId: string,
    userId: string,
    dto: UpdateQuietHoursDto,
  ): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const setting = await this.ensureSettings(businessId)
    setting.quietHoursEnabled = dto.enabled
    setting.quietFrom = dto.from
    setting.quietUntil = dto.until
    if (dto.timezone?.trim()) setting.timezone = dto.timezone.trim()
    if (dto.dailyDigestOffsetMinutes !== undefined) {
      setting.dailyDigestOffsetMinutes = clampDailyDigestOffset(dto.dailyDigestOffsetMinutes)
    }
    await this.settingsRepo.save(setting)
    return this.getSettings(businessId, userId)
  }

  /** Look up an email/phone before adding — prefills the form and flags an existing recipient. */
  async lookupContact(
    businessId: string,
    userId: string,
    rawQuery: string,
  ): Promise<NotificationRecipientLookupResult> {
    await this.assertOwner(businessId, userId)
    const q = (rawQuery ?? '').trim().toLowerCase()
    if (!q) return { user: null, existingRecipientId: null }

    const user = await this.usersRepo.findOne({ where: [{ email: q }, { phone: q }] })
    const existing = await this.recipientsRepo.findOne({
      where: [
        ...(user ? [{ businessId, userId: user.id }] : []),
        { businessId, email: q },
        { businessId, smsContact: q },
        { businessId, whatsappContact: q },
      ],
    })
    return {
      user: user
        ? { userId: user.id, name: user.name, email: user.email ?? null, phone: user.phone ?? null }
        : null,
      existingRecipientId: existing?.id ?? null,
    }
  }

  /** Add a recipient. Unique by identity (userId, else email/phone) — re-adding an existing
   * contact merges its fields and keeps its subscriptions rather than duplicating. */
  async addRecipient(
    businessId: string,
    userId: string,
    dto: AddNotificationRecipientDto,
  ): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const email = dto.email?.trim().toLowerCase() || null
    const sms = dto.smsContact?.trim() || null
    const whatsapp = dto.whatsappContact?.trim() || null

    const identity = [
      ...(dto.userId ? [{ businessId, userId: dto.userId }] : []),
      ...(email ? [{ businessId, email }] : []),
      ...(sms ? [{ businessId, smsContact: sms }] : []),
      ...(whatsapp ? [{ businessId, whatsappContact: whatsapp }] : []),
    ]
    let recipient = identity.length ? await this.recipientsRepo.findOne({ where: identity }) : null
    if (recipient) {
      recipient.name = dto.name || recipient.name
      recipient.userId = dto.userId ?? recipient.userId
      recipient.email = email ?? recipient.email
      recipient.smsContact = sms ?? recipient.smsContact
      recipient.whatsappContact = whatsapp ?? recipient.whatsappContact
    } else {
      recipient = this.recipientsRepo.create({
        businessId,
        userId: dto.userId ?? null,
        name: dto.name,
        email,
        smsContact: sms,
        whatsappContact: whatsapp,
        subscriptions: this.defaultSubscriptions(false),
      })
    }
    await this.recipientsRepo.save(recipient)
    return this.getSettings(businessId, userId)
  }

  /** Edit a recipient's name/contacts. Only provided fields change. */
  async updateRecipientContacts(
    businessId: string,
    userId: string,
    recipientId: string,
    dto: UpdateNotificationRecipientDto,
  ): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const recipient = await this.recipientsRepo.findOne({ where: { id: recipientId, businessId } })
    if (!recipient) throw new AppNotFoundException('Recipient not found', 'RECIPIENT_NOT_FOUND')
    if (dto.name !== undefined) recipient.name = dto.name.trim() || recipient.name
    if (dto.email !== undefined) recipient.email = dto.email?.trim().toLowerCase() || null
    if (dto.smsContact !== undefined) recipient.smsContact = dto.smsContact?.trim() || null
    if (dto.whatsappContact !== undefined)
      recipient.whatsappContact = dto.whatsappContact?.trim() || null
    await this.recipientsRepo.save(recipient)
    return this.getSettings(businessId, userId)
  }

  async updateRecipientSubscriptions(
    businessId: string,
    userId: string,
    recipientId: string,
    dto: UpdateRecipientSubscriptionsDto,
  ): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const recipient = await this.recipientsRepo.findOne({ where: { id: recipientId, businessId } })
    if (!recipient) throw new AppNotFoundException('Recipient not found', 'RECIPIENT_NOT_FOUND')
    const subs = recipient.subscriptions ?? {}
    for (const [event, enabled] of Object.entries(dto.subscriptions)) {
      if (NOTIFICATION_EVENTS.includes(event as NotificationEvent)) subs[event] = Boolean(enabled)
    }
    recipient.subscriptions = subs
    await this.recipientsRepo.save(recipient)
    return this.getSettings(businessId, userId)
  }

  /** Remove a recipient. The owner cannot be removed (they're re-seeded anyway). */
  async removeRecipient(
    businessId: string,
    userId: string,
    recipientId: string,
  ): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const recipient = await this.recipientsRepo.findOne({ where: { id: recipientId, businessId } })
    if (!recipient) throw new AppNotFoundException('Recipient not found', 'RECIPIENT_NOT_FOUND')
    const ctx = await this.ownerContext(businessId)
    if (recipient.userId && recipient.userId === ctx.ownerId) {
      throw new AppForbiddenException(
        'The business owner cannot be removed from recipients',
        'RECIPIENT_IS_OWNER',
      )
    }
    await this.recipientsRepo.remove(recipient)
    return this.getSettings(businessId, userId)
  }

  /**
   * Resolve the dispatch plan for one event — NOT owner-gated (the dispatcher calls this
   * on the producer's behalf). Ensures the owner recipient exists so notifications always
   * have a default target. Returns matrix-enabled channels (SMS excluded) + quiet hours +
   * the recipients subscribed to this event with their destinations.
   */
  async resolvePlan(
    businessId: string,
    event: NotificationEvent,
  ): Promise<NotificationDispatchPlan> {
    const ctx = await this.ownerContext(businessId)
    const setting = await this.ensureSettings(businessId)
    await this.ensureOwnerRecipient(businessId, ctx)

    const channels = NOTIFICATION_CHANNELS.filter((ch) => this.matrixCell(setting, event, ch))
    const rows = await this.recipientsRepo.find({ where: { businessId }, relations: ['user'] })
    const recipients = rows
      .filter((r) => Boolean(r.subscriptions?.[event]))
      .map((r) => {
        const linked = r.userId ? r.user : null
        return {
          userId: r.userId,
          email: r.email ?? linked?.email ?? null,
          whatsappContact: r.whatsappContact ?? linked?.phone ?? null,
        }
      })
    return {
      channels,
      quietHours: {
        enabled: setting.quietHoursEnabled,
        from: setting.quietFrom,
        until: setting.quietUntil,
        timezone: setting.timezone || DEFAULT_NOTIFICATION_TIMEZONE,
      },
      recipients,
    }
  }

  // -------------------------------------------------------------------------

  /** A single matrix cell, default-aware. SMS is always off (N3). */
  private matrixCell(
    setting: NotificationSetting,
    event: NotificationEvent,
    channel: NotificationChannel,
  ): boolean {
    if (!isNotificationChannelAvailable(channel)) return false
    const stored = setting.matrix?.[event]?.[channel]
    if (stored !== undefined) return stored
    return DEFAULT_ENABLED[event].includes(channel)
  }

  private async assertOwner(businessId: string, userId: string): Promise<void> {
    const member = await this.membersRepo.findOne({
      where: { businessId, userId, status: BusinessMemberStatus.ACTIVE },
    })
    if (!member || member.role !== BusinessMemberRole.OWNER) {
      throw new AppForbiddenException(
        'Only the business owner can manage notification settings',
        'NOTIF_OWNER_ONLY',
      )
    }
  }

  private async ownerContext(businessId: string): Promise<OwnerContext> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } })
    const ownerMember = await this.membersRepo.findOne({
      where: { businessId, role: BusinessMemberRole.OWNER, status: BusinessMemberStatus.ACTIVE },
      relations: ['user'],
    })
    return {
      ownerId: ownerMember?.userId ?? business?.ownerId ?? null,
      ownerUser: ownerMember?.user ?? null,
      business: business ?? null,
    }
  }

  private async ensureSettings(businessId: string): Promise<NotificationSetting> {
    let setting = await this.settingsRepo.findOne({ where: { businessId } })
    if (!setting) {
      setting = this.settingsRepo.create({ businessId, matrix: this.defaultMatrix() })
      await this.settingsRepo.save(setting)
    }
    return setting
  }

  /** Seed the owner as the default recipient (subscribed to all events), with SMS/WhatsApp
   * defaulting to the owner's phone and falling back to the business phone. */
  private async ensureOwnerRecipient(businessId: string, ctx: OwnerContext): Promise<void> {
    if (!ctx.ownerId) return
    const existing = await this.recipientsRepo.findOne({
      where: { businessId, userId: ctx.ownerId },
    })
    if (existing) return
    const u = ctx.ownerUser
    const b = ctx.business
    const phone = u?.phone ?? b?.phone ?? null
    await this.recipientsRepo.save(
      this.recipientsRepo.create({
        businessId,
        userId: ctx.ownerId,
        name: u?.name ?? 'Owner',
        email: u?.email ?? b?.email ?? null,
        smsContact: phone,
        whatsappContact: phone,
        subscriptions: this.defaultSubscriptions(true),
      }),
    )
  }

  private async toResponse(
    businessId: string,
    setting: NotificationSetting,
    ownerId: string | null,
  ): Promise<NotificationSettings> {
    const recipients = await this.recipientsRepo.find({
      where: { businessId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    })
    return {
      matrix: NOTIFICATION_EVENTS.flatMap((event) =>
        NOTIFICATION_CHANNELS.map((channel) => ({
          event,
          channel,
          enabled: this.matrixCell(setting, event, channel),
        })),
      ),
      quietHours: {
        enabled: setting.quietHoursEnabled,
        from: setting.quietFrom,
        until: setting.quietUntil,
      },
      timezone: setting.timezone || DEFAULT_NOTIFICATION_TIMEZONE,
      dailyDigestOffsetMinutes: clampDailyDigestOffset(
        setting.dailyDigestOffsetMinutes ?? DEFAULT_DAILY_DIGEST_OFFSET_MINUTES,
      ),
      recipients: recipients.map((r) => this.toRecipient(r, ownerId)),
      unavailableChannels: [...UNAVAILABLE_NOTIFICATION_CHANNELS],
    }
  }

  private toRecipient(
    r: NotificationRecipient,
    ownerId: string | null,
  ): NotificationRecipientModel {
    const linked = r.userId ? r.user : null
    // For a linked recipient, the user's own email/phone are the natural fallback when
    // the row didn't store explicit contacts (e.g. rows seeded before the contact split).
    const email = r.email ?? linked?.email ?? null
    const smsContact = r.smsContact ?? linked?.phone ?? null
    const whatsappContact = r.whatsappContact ?? linked?.phone ?? null
    return {
      id: r.id,
      userId: r.userId,
      name: r.name ?? linked?.name ?? '',
      email,
      smsContact,
      whatsappContact,
      emailVerified: Boolean(linked && email && email === linked.email && linked.isEmailVerified),
      smsVerified: Boolean(
        linked && smsContact && smsContact === linked.phone && linked.isPhoneVerified,
      ),
      whatsappVerified: Boolean(
        linked && whatsappContact && whatsappContact === linked.phone && linked.isPhoneVerified,
      ),
      isOwner: r.userId !== null && r.userId === ownerId,
      subscriptions: this.fillSubscriptions(r.subscriptions),
    }
  }

  private defaultMatrix(): Record<string, Record<string, boolean>> {
    const matrix: Record<string, Record<string, boolean>> = {}
    for (const event of NOTIFICATION_EVENTS) {
      const enabled = new Set(DEFAULT_ENABLED[event])
      matrix[event] = {}
      for (const channel of NOTIFICATION_CHANNELS) {
        matrix[event][channel] = isNotificationChannelAvailable(channel) && enabled.has(channel)
      }
    }
    return matrix
  }

  private defaultSubscriptions(all: boolean): Record<string, boolean> {
    const subs: Record<string, boolean> = {}
    for (const event of NOTIFICATION_EVENTS) subs[event] = all
    return subs
  }

  private fillSubscriptions(
    stored?: Record<string, boolean> | null,
  ): Record<NotificationEvent, boolean> {
    const subs = {} as Record<NotificationEvent, boolean>
    for (const event of NOTIFICATION_EVENTS) subs[event] = Boolean(stored?.[event])
    return subs
  }
}
