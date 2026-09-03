import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PaymentProvider } from '@/entities/payment-provider.entity'
import { PaymentProviderCapability } from '@/entities/payment-provider-capability.entity'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { BusinessPaymentRoute } from '@/entities/business-payment-route.entity'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { Business } from '@/entities/business.entity'
import { AuditModule } from '@/modules/audit/audit.module'
import { RedisModule } from '@/common/redis/redis.module'
import {
  EnvMasterKeyProvider,
  MASTER_KEY_PROVIDER,
  NullMasterKeyProvider,
  type MasterKeyProvider,
} from '@/common/security/master-key.provider'
import { PaymentCatalogueService } from './services/payment-catalogue.service'
import { PaymentCredentialsService } from './services/payment-credentials.service'
import { PaymentVerificationService } from './services/payment-verification.service'
import { PaymentRoutingService } from './services/payment-routing.service'
import { PaymentAttemptsService } from './services/payment-attempts.service'
import { PaymentProvidersController } from './controllers/payment-providers.controller'
import { PaymentWebhookController } from './controllers/payment-webhook.controller'
import { PaymentWebhookGuard } from './guards/payment-webhook.guard'
import { PaymentsScheduler } from './payments.scheduler'
import { PaymentsDevBootstrap } from './payments-dev-bootstrap'
import { PAYMENT_ADAPTERS, PaymentAdapterRegistry } from './adapters/adapter.registry'
import { MtnAdapter } from './adapters/mtn.adapter'
import { StripeAdapter } from './adapters/stripe.adapter'
import type { PaymentProviderAdapter } from './adapters/payment-provider.adapter'

/**
 * Spec 07 — payment provider registry & execution layer. Server-only. The MasterKeyProvider is
 * env-backed (PAYMENT_MASTER_KEYS); when unset a NullMasterKeyProvider makes any credential
 * encrypt/decrypt fail loudly rather than storing plaintext.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentProvider,
      PaymentProviderCapability,
      BusinessPaymentProvider,
      BusinessPaymentRoute,
      PaymentAttempt,
      Business,
    ]),
    AuditModule,
    RedisModule,
  ],
  controllers: [PaymentProvidersController, PaymentWebhookController],
  providers: [
    PaymentCatalogueService,
    PaymentCredentialsService,
    PaymentVerificationService,
    PaymentRoutingService,
    PaymentAttemptsService,
    PaymentWebhookGuard,
    PaymentAdapterRegistry,
    PaymentsScheduler,
    PaymentsDevBootstrap,
    {
      provide: MASTER_KEY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): MasterKeyProvider => {
        const raw = config.get<string>('PAYMENT_MASTER_KEYS')
        return raw ? new EnvMasterKeyProvider(raw) : new NullMasterKeyProvider()
      },
    },
    {
      provide: PAYMENT_ADAPTERS,
      // MTN: real OAuth verifyCredentials (execution pending the payment API, build 13). Stripe: real
      // verify + webhook signature/parse + PaymentIntent poll (execution is builds 9–12).
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProviderAdapter[] => [
        new MtnAdapter(config.get<string>('MTN_API_BASE_URL')),
        new StripeAdapter(config.get<string>('STRIPE_API_BASE_URL')),
      ],
    },
  ],
  exports: [
    PaymentCredentialsService,
    PaymentCatalogueService,
    PaymentVerificationService,
    PaymentRoutingService,
    PaymentAttemptsService,
  ],
})
export class PaymentsModule {}
