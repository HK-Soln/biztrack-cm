import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import {
  NotificationType,
  ReviewFlagCode,
  ReviewFlagSeverity,
  ReviewFlagStatus,
  type ReviewFlagDraft,
  type ReviewFlagsQuery,
} from '@biztrack/types'
import { APP_ROUTES } from '@biztrack/utils'
import { AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { Locale } from '@/common/enums/locale.enum'
import { Business } from '@/entities/business.entity'
import { ReviewFlagRecord } from '@/entities/review-flag.entity'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'

const SEVERITY_ORDER: Record<ReviewFlagSeverity, number> = {
  [ReviewFlagSeverity.HIGH]: 0,
  [ReviewFlagSeverity.MEDIUM]: 1,
  [ReviewFlagSeverity.LOW]: 2,
}

/**
 * Stores and lists review flags. Which flag to raise, and how serious it is, is decided by
 * @biztrack/domain (packages/domain/src/review); this service only persists the drafts,
 * tells the owner, and lets them be resolved.
 */
@Injectable()
export class ReviewFlagsService {
  constructor(
    @InjectRepository(ReviewFlagRecord)
    private readonly flagsRepo: Repository<ReviewFlagRecord>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  /**
   * Persist flags inside the caller's transaction. Idempotent on (business, code,
   * dedupeKey): a retried sync inserts nothing. Returns only the flags newly stored, so
   * the caller can notify for those once its transaction has committed.
   */
  async raise(
    manager: EntityManager,
    businessId: string,
    drafts: ReviewFlagDraft[],
  ): Promise<ReviewFlagDraft[]> {
    const raised: ReviewFlagDraft[] = []
    for (const draft of drafts) {
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(ReviewFlagRecord)
        .values({
          businessId,
          outletId: draft.outletId ?? null,
          code: draft.code,
          severity: draft.severity,
          entityType: draft.entityType,
          entityId: draft.entityId,
          dedupeKey: draft.dedupeKey,
          details: draft.details as Record<string, never>,
          status: ReviewFlagStatus.OPEN,
        })
        .orIgnore()
        .execute()
      if ((result.identifiers ?? []).some((identifier) => identifier?.id)) raised.push(draft)
    }
    return raised
  }

  /**
   * Tell the owner about newly raised flags: one notification, urgent when any flag is
   * HIGH. Call after the transaction that raised them has committed. Best-effort — a
   * notification hiccup never disturbs the sync.
   */
  async notify(businessId: string, flags: ReviewFlagDraft[], label?: string | null): Promise<void> {
    if (flags.length === 0) return
    try {
      const top = [...flags].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
      )[0]!
      const business = await this.businessRepo.findOne({
        where: { id: businessId },
        relations: ['owner'],
      })
      const en = business?.owner?.language === Locale.EN
      const { title, body } = this.copy(top.code, en, label?.trim() || '')
      await this.dispatcher.dispatch({
        businessId,
        event: NotificationType.TEAM_ACTIVITY,
        title,
        body: flags.length > 1 ? `${body} (+${flags.length - 1})` : body,
        deeplink: APP_ROUTES.activity(),
        metadata: {
          reviewFlags: flags.map((flag) => ({ code: flag.code, severity: flag.severity })),
          entityType: top.entityType,
          entityId: top.entityId,
        },
        urgent: top.severity === ReviewFlagSeverity.HIGH,
      })
    } catch {
      // Best-effort.
    }
  }

  async list(businessId: string, query: ReviewFlagsQuery) {
    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 200)
    const builder = this.flagsRepo
      .createQueryBuilder('flag')
      .where('flag.businessId = :businessId', { businessId })
    if (query.status) builder.andWhere('flag.status = :status', { status: query.status })
    if (query.severity) builder.andWhere('flag.severity = :severity', { severity: query.severity })
    if (query.code) builder.andWhere('flag.code = :code', { code: query.code })
    if (query.entityId) builder.andWhere('flag.entityId = :entityId', { entityId: query.entityId })
    // The owner sees the most serious first, then the newest.
    builder
      .addSelect(
        `CASE flag.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END`,
        'severity_rank',
      )
      .orderBy('severity_rank', 'ASC')
      .addOrderBy('flag.createdAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit)
    const [data, total] = await builder.getManyAndCount()
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async countOpen(businessId: string): Promise<{ open: number; high: number }> {
    const rows = await this.flagsRepo
      .createQueryBuilder('flag')
      .select('flag.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .where('flag.businessId = :businessId', { businessId })
      .andWhere('flag.status = :status', { status: ReviewFlagStatus.OPEN })
      .groupBy('flag.severity')
      .getRawMany<{ severity: ReviewFlagSeverity; count: string }>()
    const open = rows.reduce((sum, row) => sum + Number(row.count), 0)
    const high = Number(rows.find((row) => row.severity === ReviewFlagSeverity.HIGH)?.count ?? 0)
    return { open, high }
  }

  async resolve(businessId: string, id: string, userId: string, note?: string) {
    const flag = await this.flagsRepo.findOne({ where: { id, businessId } })
    if (!flag) throw new AppNotFoundException('Review flag not found.', 'REVIEW_FLAG_NOT_FOUND')
    if (flag.status === ReviewFlagStatus.RESOLVED) return flag
    flag.status = ReviewFlagStatus.RESOLVED
    flag.resolvedAt = new Date()
    flag.resolvedById = userId
    flag.resolutionNote = note?.trim() || null
    return this.flagsRepo.save(flag)
  }

  private copy(code: ReviewFlagCode, en: boolean, label: string): { title: string; body: string } {
    const on = label ? (en ? ` on ${label}` : ` sur ${label}`) : ''
    switch (code) {
      case ReviewFlagCode.REFUND_EXCEEDS_PAID:
        return en
          ? {
              title: 'Refund above the amount paid',
              body: `A till refunded more than was paid${on}.`,
            }
          : {
              title: 'Remboursement supérieur au montant payé',
              body: `Une caisse a remboursé plus que le montant payé${on}.`,
            }
      case ReviewFlagCode.REFUND_AMOUNT_MISMATCH:
        return en
          ? { title: 'Refund needs review', body: `A refund is above the value of the goods${on}.` }
          : {
              title: 'Remboursement à vérifier',
              body: `Un remboursement dépasse la valeur des articles${on}.`,
            }
      case ReviewFlagCode.REFUND_QUANTITY_MISMATCH:
        return en
          ? { title: 'Return needs review', body: `A return could not be applied as sent${on}.` }
          : {
              title: 'Retour à vérifier',
              body: `Un retour n’a pas pu être appliqué tel quel${on}.`,
            }
      case ReviewFlagCode.NEGATIVE_STOCK:
        return en
          ? { title: 'Stock below zero', body: `A sale took stock below zero${on}.` }
          : { title: 'Stock négatif', body: `Une vente a fait passer le stock sous zéro${on}.` }
      case ReviewFlagCode.SERIAL_ALREADY_SOLD:
        return en
          ? { title: 'Serial number sold twice', body: `A serial unit was already sold${on}.` }
          : {
              title: 'Numéro de série vendu deux fois',
              body: `Une unité sérialisée était déjà vendue${on}.`,
            }
      case ReviewFlagCode.DISCOUNT_UNAUTHORIZED:
        return en
          ? { title: 'Discount needs review', body: `A discount was above the allowed limit${on}.` }
          : {
              title: 'Remise à vérifier',
              body: `Une remise dépasse la limite autorisée${on}.`,
            }
    }
  }
}
