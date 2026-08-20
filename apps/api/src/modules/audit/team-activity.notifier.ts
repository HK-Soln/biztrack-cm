import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DEFAULT_CASH_VARIANCE_TOLERANCE,
  NotificationType,
  type AuditAction,
  type AuditChanges,
} from '@biztrack/types'
import { APP_ROUTES } from '@biztrack/utils'
import { Locale } from '@/common/enums/locale.enum'
import { Business } from '@/entities/business.entity'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'

/** Audit actions the owner is notified about (TEAM_ACTIVITY). Kept deliberately narrow —
 * high-signal, financially/security sensitive staff actions, not the whole audit stream:
 *  - SALE_VOIDED     — a sale was voided.
 *  - DISCOUNT_APPLIED — only logged when a discount is flagged (over-limit / below-cost).
 *  - SHIFT_CLOSED    — only notified when the cash count is out of tolerance. */
const TEAM_ACTIONS = new Set<AuditAction>(['SALE_VOIDED', 'DISCOUNT_APPLIED', 'SHIFT_CLOSED'])

export interface TeamActivityInput {
  businessId: string | null
  action: AuditAction
  entityLabel?: string | null
  actorName?: string | null
  changes?: AuditChanges | null
}

/**
 * Fans high-signal staff actions from the audit stream out to the owner as TEAM_ACTIVITY
 * notifications. Called from BOTH audit ingest paths — the queue processor (API-direct
 * actions via AuditService.log) and ingestBatch (desktop-pushed rows) — so it covers
 * cloud + offline-first devices with one hook. Fire-and-forget.
 */
@Injectable()
export class TeamActivityNotifier {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
  ) {}

  async maybeNotify(input: TeamActivityInput): Promise<void> {
    try {
      if (!input.businessId || !TEAM_ACTIONS.has(input.action)) return

      const after = (input.changes?.after ?? {}) as Record<string, unknown>
      let variance = 0
      if (input.action === 'SHIFT_CLOSED') {
        variance = Number(after.varianceCash ?? 0)
        // Only a shift closed OUT of tolerance is worth the owner's attention.
        if (Math.abs(variance) <= DEFAULT_CASH_VARIANCE_TOLERANCE) return
      }

      const business = await this.businessRepo.findOne({
        where: { id: input.businessId },
        relations: ['owner'],
      })
      const en = business?.owner?.language === Locale.EN
      const actor = input.actorName?.trim() || (en ? 'A team member' : 'Un membre de l’équipe')
      const label = input.entityLabel?.trim() || ''
      const { title, body } = this.copy(input.action, en, actor, label, variance)

      await this.dispatcher.dispatch({
        businessId: input.businessId,
        event: NotificationType.TEAM_ACTIVITY,
        title,
        body,
        deeplink: APP_ROUTES.activity(),
        metadata: { action: input.action, entityLabel: label },
      })
    } catch {
      // Best-effort — a notification hiccup must never disturb the audit trail.
    }
  }

  private copy(
    action: AuditAction,
    en: boolean,
    actor: string,
    label: string,
    variance: number,
  ): { title: string; body: string } {
    const money = Math.abs(variance).toLocaleString(en ? 'en-US' : 'fr-FR')
    switch (action) {
      case 'SALE_VOIDED':
        return en
          ? { title: 'Sale voided', body: `${actor} voided sale ${label}.` }
          : { title: 'Vente annulée', body: `${actor} a annulé la vente ${label}.` }
      case 'DISCOUNT_APPLIED':
        return en
          ? {
              title: 'Discount needs review',
              body: `${actor} applied a flagged discount on sale ${label}.`,
            }
          : {
              title: 'Remise à vérifier',
              body: `${actor} a appliqué une remise signalée sur la vente ${label}.`,
            }
      case 'SHIFT_CLOSED':
      default: {
        const over = variance > 0
        return en
          ? {
              title: 'Cash drawer variance',
              body: `${actor} closed a shift ${over ? 'over' : 'short'} by ${money} XAF.`,
            }
          : {
              title: 'Écart de caisse',
              body: `${actor} a clôturé une caisse ${over ? 'excédentaire' : 'déficitaire'} de ${money} XAF.`,
            }
      }
    }
  }
}
