import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PaymentMethod } from '@biztrack/types'
import { PaymentProviderCapability } from '@/entities/payment-provider-capability.entity'

/**
 * DEV ONLY — activates the STRIPE/CARD/CM capability so the pipeline can be exercised against Stripe
 * sandbox (it ships is_active=false because Stripe doesn't onboard CM merchants for payouts). Guarded
 * twice: it no-ops in production and unless PAYMENTS_DEV_ACTIVATE_STRIPE_CM=true. Never a prod path.
 */
@Injectable()
export class PaymentsDevBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentsDevBootstrap.name)

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(PaymentProviderCapability)
    private readonly capabilities: Repository<PaymentProviderCapability>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production'
    const enabled = this.config.get<string>('PAYMENTS_DEV_ACTIVATE_STRIPE_CM') === 'true'
    if (isProduction || !enabled) return

    const result = await this.capabilities.update(
      { providerCode: 'STRIPE', paymentMethod: PaymentMethod.CARD, countryCode: 'CM' },
      { isActive: true },
    )
    if (result.affected) {
      this.logger.warn(
        'DEV: STRIPE/CARD/CM capability activated (PAYMENTS_DEV_ACTIVATE_STRIPE_CM). Not for production.',
      )
    }
  }
}
