import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PaymentVerificationService } from './services/payment-verification.service'

/**
 * Spec 07 §5 — daily re-verification of merchant provider connections. Keys get revoked; a merchant
 * must learn before a customer hits a broken checkout.
 */
@Injectable()
export class PaymentsScheduler {
  private readonly logger = new Logger(PaymentsScheduler.name)

  constructor(private readonly verification: PaymentVerificationService) {}

  @Cron('0 5 * * *', { timeZone: 'Africa/Douala' })
  async reverifyProviders(): Promise<void> {
    const count = await this.verification.verifyAllDue()
    if (count > 0) this.logger.log(`Re-verified ${count} payment provider connection(s).`)
  }
}
