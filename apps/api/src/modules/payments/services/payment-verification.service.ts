import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PaymentProviderConnectionStatus, type BusinessPaymentProviderView } from '@biztrack/types'
import { AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { PaymentAdapterRegistry } from '../adapters/adapter.registry'
import { PaymentCredentialsService } from './payment-credentials.service'

/** Re-verify an ACTIVE/FAILED connection at most this often via the daily sweep. */
const REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Spec 07 §5 — the verification lifecycle. Layer 2 of the three-layer check: what the merchant's
 * account is ACTUALLY approved for. Calls the adapter's read-only verifyCredentials (never a test
 * charge) and records status + verified_methods on the connection. Re-verified daily because keys
 * get revoked; a merchant must learn before a customer hits a broken checkout.
 */
@Injectable()
export class PaymentVerificationService {
  private readonly logger = new Logger(PaymentVerificationService.name)

  constructor(
    @InjectRepository(BusinessPaymentProvider)
    private readonly connRepo: Repository<BusinessPaymentProvider>,
    private readonly credentials: PaymentCredentialsService,
    private readonly adapters: PaymentAdapterRegistry,
  ) {}

  /** Verify one connection and persist the outcome. Best-effort: a provider/network error lands as
   * PROVIDER_UNAVAILABLE rather than throwing (the daily sweep retries). */
  async verify(businessId: string, connectionId: string): Promise<BusinessPaymentProviderView> {
    const conn = await this.connRepo.findOne({ where: { id: connectionId, businessId } })
    if (!conn) throw new AppNotFoundException('Connection not found.', 'NOT_FOUND')
    await this.verifyRow(conn)
    return this.credentials.getConnectionView(businessId, connectionId)
  }

  private async verifyRow(conn: BusinessPaymentProvider): Promise<void> {
    const now = new Date()
    const adapter = this.adapters.get(conn.providerCode)
    if (!adapter) {
      await this.connRepo.update(conn.id, {
        status: PaymentProviderConnectionStatus.PROVIDER_UNAVAILABLE,
        verificationError: 'No adapter is available for this provider yet.',
        lastVerifiedAt: now,
      })
      return
    }

    const creds = await this.credentials.getDecryptedCredentials(conn.businessId, conn.providerCode)
    if (!creds) {
      await this.connRepo.update(conn.id, {
        status: PaymentProviderConnectionStatus.FAILED,
        verificationError: 'No stored credentials.',
        verifiedMethods: [],
        lastVerifiedAt: now,
      })
      return
    }

    try {
      const result = await adapter.verifyCredentials(creds)
      await this.connRepo.update(conn.id, {
        status: result.valid
          ? PaymentProviderConnectionStatus.ACTIVE
          : PaymentProviderConnectionStatus.FAILED,
        verifiedMethods: result.valid ? result.enabledMethods : [],
        verificationError: result.valid ? null : (result.error ?? 'Verification failed.'),
        lastVerifiedAt: now,
      })
    } catch (error) {
      await this.connRepo.update(conn.id, {
        status: PaymentProviderConnectionStatus.PROVIDER_UNAVAILABLE,
        verificationError: error instanceof Error ? error.message : 'Provider unavailable.',
        lastVerifiedAt: now,
      })
    }
  }

  /** Daily sweep — re-verify every live connection whose last check is stale. */
  async verifyAllDue(): Promise<number> {
    const cutoff = new Date(Date.now() - REVERIFY_INTERVAL_MS)
    const due = await this.connRepo
      .createQueryBuilder('c')
      .where('c.deleted_at IS NULL')
      .andWhere('c.status IN (:...statuses)', {
        statuses: [
          PaymentProviderConnectionStatus.ACTIVE,
          PaymentProviderConnectionStatus.FAILED,
          PaymentProviderConnectionStatus.PENDING_VERIFICATION,
          PaymentProviderConnectionStatus.PROVIDER_UNAVAILABLE,
        ],
      })
      .andWhere('(c.last_verified_at IS NULL OR c.last_verified_at < :cutoff)', { cutoff })
      .getMany()
    for (const conn of due) {
      try {
        await this.verifyRow(conn)
      } catch (error) {
        this.logger.warn(`Re-verify failed for ${conn.id}: ${String(error)}`)
      }
    }
    return due.length
  }
}
