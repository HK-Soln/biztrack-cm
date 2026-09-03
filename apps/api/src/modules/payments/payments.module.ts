import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PaymentProvider } from '@/entities/payment-provider.entity'
import { PaymentProviderCapability } from '@/entities/payment-provider-capability.entity'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { AuditModule } from '@/modules/audit/audit.module'
import {
  EnvMasterKeyProvider,
  MASTER_KEY_PROVIDER,
  NullMasterKeyProvider,
  type MasterKeyProvider,
} from '@/common/security/master-key.provider'
import { PaymentCatalogueService } from './services/payment-catalogue.service'
import { PaymentCredentialsService } from './services/payment-credentials.service'
import { PaymentProvidersController } from './controllers/payment-providers.controller'

/**
 * Spec 07 — payment provider registry & execution layer. Server-only. The MasterKeyProvider is
 * env-backed (PAYMENT_MASTER_KEYS); when unset a NullMasterKeyProvider makes any credential
 * encrypt/decrypt fail loudly rather than storing plaintext.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentProvider, PaymentProviderCapability, BusinessPaymentProvider]),
    AuditModule,
  ],
  controllers: [PaymentProvidersController],
  providers: [
    PaymentCatalogueService,
    PaymentCredentialsService,
    {
      provide: MASTER_KEY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): MasterKeyProvider => {
        const raw = config.get<string>('PAYMENT_MASTER_KEYS')
        return raw ? new EnvMasterKeyProvider(raw) : new NullMasterKeyProvider()
      },
    },
  ],
  exports: [PaymentCredentialsService, PaymentCatalogueService],
})
export class PaymentsModule {}
