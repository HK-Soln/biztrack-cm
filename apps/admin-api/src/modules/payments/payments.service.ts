import { HttpStatus, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import { Business } from '@/entities/read/business.entity'
import { SubscriptionEvent } from '@/entities/read/subscription-event.entity'

const NOTE =
  'Subscription billing is not yet integrated — no payment ledger exists. This view is derived ' +
  'from subscription_events; retry/waive are disabled until a billing provider is wired.'

/**
 * Read-only stub. There is no payment ledger in the schema (confirmed on dev): the only
 * signal is PAYMENT_SUCCESS/PAYMENT_FAILED subscription_events, which are not currently
 * emitted. Endpoints exist so the surface is complete and lights up when billing lands.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(SubscriptionEvent) private readonly eventRepo: Repository<SubscriptionEvent>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
  ) {}

  async list() {
    return this.fromEvents(['PAYMENT_SUCCESS', 'PAYMENT_FAILED'])
  }

  async failures() {
    return this.fromEvents(['PAYMENT_FAILED'])
  }

  retry(_id: string): never {
    throw new AppException(NOTE, HttpStatus.NOT_IMPLEMENTED, 'BILLING_NOT_INTEGRATED')
  }

  waive(_id: string): never {
    throw new AppException(NOTE, HttpStatus.NOT_IMPLEMENTED, 'BILLING_NOT_INTEGRATED')
  }

  private async fromEvents(events: string[]) {
    const rows = await this.eventRepo.find({
      where: { event: In(events) },
      order: { createdAt: 'DESC' },
      take: 100,
    })
    const ids = [...new Set(rows.map((r) => r.businessId))]
    const businesses = ids.length ? await this.businessRepo.find({ where: { id: In(ids) } }) : []
    const nameById = new Map(businesses.map((b) => [b.id, b.name]))
    return {
      billingIntegrationPending: true,
      note: NOTE,
      data: rows.map((r) => ({
        id: r.id,
        businessId: r.businessId,
        businessName: nameById.get(r.businessId) ?? null,
        event: r.event,
        at: r.createdAt,
        metadata: r.metadata ?? null,
      })),
    }
  }
}
