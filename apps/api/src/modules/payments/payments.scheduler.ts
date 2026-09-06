import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PaymentVerificationService } from './services/payment-verification.service'
import { PaymentReconciliationService } from './services/payment-reconciliation.service'

/**
 * Spec 07 §5 — daily re-verification of merchant provider connections. Keys get revoked; a merchant
 * must learn before a customer hits a broken checkout. Plus §7.5 — a periodic sweep that surfaces
 * stranded in-store confirmations (money collected, no sale) for reconciliation.
 */
@Injectable()
export class PaymentsScheduler {
  private readonly logger = new Logger(PaymentsScheduler.name)

  constructor(
    private readonly verification: PaymentVerificationService,
    private readonly reconciliation: PaymentReconciliationService,
  ) {}

  @Cron('0 5 * * *', { timeZone: 'Africa/Douala' })
  async reverifyProviders(): Promise<void> {
    const count = await this.verification.verifyAllDue()
    if (count > 0) this.logger.log(`Re-verified ${count} payment provider connection(s).`)
  }

  @Cron('*/15 * * * *')
  async reconcileStrandedPayments(): Promise<void> {
    const count = await this.reconciliation.notifyStrandedInStorePayments()
    if (count > 0) this.logger.log(`Flagged ${count} stranded in-store payment(s) for reconciliation.`)
  }
}
