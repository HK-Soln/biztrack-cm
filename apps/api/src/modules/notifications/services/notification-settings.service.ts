import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import {
  BusinessMemberRole,
  BusinessMemberStatus,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NotificationChannel,
  NotificationType,
  UNAVAILABLE_NOTIFICATION_CHANNELS,
  isNotificationChannelAvailable,
  type NotificationEvent,
  type NotificationRecipient as NotificationRecipientModel,
  type NotificationSettings,
} from '@biztrack/types'
import { AppForbiddenException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { BusinessMember } from '@/entities/business-member.entity'
import { NotificationRecipient } from '@/entities/notification-recipient.entity'
import { NotificationSetting } from '@/entities/notification-setting.entity'
import type {
  AddNotificationRecipientDto,
  UpdateNotificationMatrixDto,
  UpdateQuietHoursDto,
  UpdateRecipientSubscriptionsDto,
} from '../dto/notification-settings.dto'

/** Resolved routing for one event, as the dispatcher needs it. */
export interface NotificationDispatchPlan {
  /** Matrix-enabled channels for the event (SMS already excluded). */
  channels: NotificationChannel[]
  quietHours: { enabled: boolean; from: string; until: string }
  /** Recipients subscribed to the event, with their resolved destinations. */
  recipients: Array<{
    userId: string | null
    email: string | null
    phone: string | null
    emailVerified: boolean
    phoneVerified: boolean
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
  [NotificationType.DAILY_SUMMARY]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  [NotificationType.TEAM_ACTIVITY]: [NotificationChannel.IN_APP],
  [NotificationType.BILLING]: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
}

/**
 * The Settings → Notifications control plane: the business-level event×channel matrix,
 * quiet hours, and per-recipient event subscriptions. Owner-only. The dispatcher (and
 * every producer through it) reads these before fanning a notification out.
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
  ) {}

  /** Load (reconciling defaults + members) the full settings payload. Owner-only. */
  async getSettings(businessId: string, userId: string): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const members = await this.activeMembers(businessId)
    const ownerId = members.find((m) => m.role === BusinessMemberRole.OWNER)?.userId ?? null
    const setting = await this.ensureSettings(businessId)
    await this.ensureRecipients(businessId, members, ownerId)
    return this.toResponse(businessId, setting, ownerId)
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
    await this.settingsRepo.save(setting)
    return this.getSettings(businessId, userId)
  }

  /** Add a bare (email/phone) recipient. Member recipients are auto-seeded, not added here. */
  async addRecipient(
    businessId: string,
    userId: string,
    dto: AddNotificationRecipientDto,
  ): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const recipient = this.recipientsRepo.create({
      businessId,
      userId: dto.userId ?? null,
      name: dto.name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      subscriptions: this.defaultSubscriptions(false),
    })
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

  /** Remove a bare recipient. Member-linked recipients cannot be removed (they follow the team). */
  async removeRecipient(
    businessId: string,
    userId: string,
    recipientId: string,
  ): Promise<NotificationSettings> {
    await this.assertOwner(businessId, userId)
    const recipient = await this.recipientsRepo.findOne({ where: { id: recipientId, businessId } })
    if (!recipient) throw new AppNotFoundException('Recipient not found', 'RECIPIENT_NOT_FOUND')
    if (recipient.userId) {
      throw new AppForbiddenException(
        'Team-member recipients cannot be removed',
        'RECIPIENT_IS_MEMBER',
      )
    }
    await this.recipientsRepo.softRemove(recipient)
    return this.getSettings(businessId, userId)
  }

  /**
   * Resolve the dispatch plan for one event — NOT owner-gated (the dispatcher calls
   * this on the producer's behalf). Reconciles the settings row + member recipients so
   * the owner is covered even if Settings was never opened. Returns the matrix-enabled
   * channels (SMS excluded) + quiet hours + the recipients subscribed to this event.
   */
  async resolvePlan(
    businessId: string,
    event: NotificationEvent,
  ): Promise<NotificationDispatchPlan> {
    const members = await this.activeMembers(businessId)
    const ownerId = members.find((m) => m.role === BusinessMemberRole.OWNER)?.userId ?? null
    const setting = await this.ensureSettings(businessId)
    await this.ensureRecipients(businessId, members, ownerId)

    const channels = NOTIFICATION_CHANNELS.filter((ch) => this.matrixCell(setting, event, ch))
    const rows = await this.recipientsRepo.find({ where: { businessId }, relations: ['user'] })
    const recipients = rows
      .filter((r) => Boolean(r.subscriptions?.[event]))
      .map((r) => {
        const linked = r.userId ? r.user : null
        return {
          userId: r.userId,
          email: linked?.email ?? r.email ?? null,
          phone: linked?.phone ?? r.phone ?? null,
          emailVerified: linked ? Boolean(linked.isEmailVerified) : false,
          phoneVerified: linked ? Boolean(linked.isPhoneVerified) : false,
        }
      })
    return {
      channels,
      quietHours: {
        enabled: setting.quietHoursEnabled,
        from: setting.quietFrom,
        until: setting.quietUntil,
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

  private activeMembers(businessId: string): Promise<BusinessMember[]> {
    return this.membersRepo.find({
      where: { businessId, status: Not(BusinessMemberStatus.REMOVED) },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    })
  }

  private async ensureSettings(businessId: string): Promise<NotificationSetting> {
    let setting = await this.settingsRepo.findOne({ where: { businessId } })
    if (!setting) {
      setting = this.settingsRepo.create({ businessId, matrix: this.defaultMatrix() })
      await this.settingsRepo.save(setting)
    }
    return setting
  }

  /** Ensure every active member has a recipient row (owner subscribed to all events by default). */
  private async ensureRecipients(
    businessId: string,
    members: BusinessMember[],
    ownerId: string | null,
  ): Promise<void> {
    const existing = await this.recipientsRepo.find({ where: { businessId } })
    const linkedUserIds = new Set(existing.map((r) => r.userId).filter(Boolean))
    const toCreate: NotificationRecipient[] = []
    for (const m of members) {
      if (m.status !== BusinessMemberStatus.ACTIVE) continue
      if (linkedUserIds.has(m.userId)) continue
      toCreate.push(
        this.recipientsRepo.create({
          businessId,
          userId: m.userId,
          subscriptions: this.defaultSubscriptions(m.userId === ownerId),
        }),
      )
    }
    if (toCreate.length) await this.recipientsRepo.save(toCreate)
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
      recipients: recipients.map((r) => this.toRecipient(r, ownerId)),
      unavailableChannels: [...UNAVAILABLE_NOTIFICATION_CHANNELS],
    }
  }

  private toRecipient(
    r: NotificationRecipient,
    ownerId: string | null,
  ): NotificationRecipientModel {
    const linked = r.userId ? r.user : null
    return {
      id: r.id,
      userId: r.userId,
      name: linked?.name ?? r.name ?? '',
      email: linked?.email ?? r.email ?? null,
      phone: linked?.phone ?? r.phone ?? null,
      emailVerified: linked ? Boolean(linked.isEmailVerified) : false,
      phoneVerified: linked ? Boolean(linked.isPhoneVerified) : false,
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
