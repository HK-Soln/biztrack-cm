import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PaymentMethod } from '@biztrack/types'
import { PaymentProvider } from '@/entities/payment-provider.entity'
import { PaymentProviderCapability } from '@/entities/payment-provider-capability.entity'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { BusinessPaymentRoute } from '@/entities/business-payment-route.entity'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { Business } from '@/entities/business.entity'
import { AuditModule } from '@/modules/audit/audit.module'
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
import { PaymentProvidersController } from './controllers/payment-providers.controller'
import { PaymentsScheduler } from './payments.scheduler'
import { PAYMENT_ADAPTERS, PaymentAdapterRegistry } from './adapters/adapter.registry'
import { FakeProviderAdapter } from './adapters/fake.adapter'
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
  ],
  controllers: [PaymentProvidersController],
  providers: [
    PaymentCatalogueService,
    PaymentCredentialsService,
    PaymentVerificationService,
    PaymentRoutingService,
    PaymentAdapterRegistry,
    PaymentsScheduler,
    {
      provide: MASTER_KEY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): MasterKeyProvider => {
        const raw = config.get<string>('PAYMENT_MASTER_KEYS')
        return raw ? new EnvMasterKeyProvider(raw) : new NullMasterKeyProvider()
      },
    },
    {
      // TODO(sandbox): register the real Stripe (build 8) + MTN (build 13) adapters here in place of
      // the fakes. Keeping the interface means this is a registry change, not a caller change.
      provide: PAYMENT_ADAPTERS,
      useValue: [
        new FakeProviderAdapter('STRIPE', [PaymentMethod.CARD]),
        new FakeProviderAdapter('MTN', [PaymentMethod.MTN_MOMO]),
      ] satisfies PaymentProviderAdapter[],
    },
  ],
  exports: [
    PaymentCredentialsService,
    PaymentCatalogueService,
    PaymentVerificationService,
    PaymentRoutingService,
  ],
})
export class PaymentsModule {}
