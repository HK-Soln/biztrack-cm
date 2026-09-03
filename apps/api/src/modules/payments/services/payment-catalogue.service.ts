import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  PaymentProvider as PaymentProviderView,
  PaymentProviderCapability as CapabilityView,
} from '@biztrack/types'
import { PaymentProvider } from '@/entities/payment-provider.entity'
import { PaymentProviderCapability } from '@/entities/payment-provider-capability.entity'

/**
 * Spec 07 §2.1 — read the provider catalogue. Safe to expose (no secrets): the UI uses
 * `credentialSchema` to render the connect form, and capabilities to show which methods a merchant
 * can enable for their country.
 */
@Injectable()
export class PaymentCatalogueService {
  constructor(
    @InjectRepository(PaymentProvider)
    private readonly providers: Repository<PaymentProvider>,
    @InjectRepository(PaymentProviderCapability)
    private readonly capabilities: Repository<PaymentProviderCapability>,
  ) {}

  async listProviders(): Promise<PaymentProviderView[]> {
    const rows = await this.providers.find({ where: { isActive: true }, order: { name: 'ASC' } })
    return rows.map((p) => ({
      code: p.code,
      name: p.name,
      authType: p.authType,
      credentialSchema: p.credentialSchema,
      isActive: p.isActive,
    }))
  }

  /** Active capabilities for a country — the first verification layer (§5). */
  async listCapabilities(countryCode: string): Promise<CapabilityView[]> {
    const rows = await this.capabilities.find({
      where: { countryCode, isActive: true },
    })
    return rows.map((c) => ({
      providerCode: c.providerCode,
      paymentMethod: c.paymentMethod,
      countryCode: c.countryCode,
      supportsPaymentLinks: c.supportsPaymentLinks,
      supportsUssdPush: c.supportsUssdPush,
      supportsRefunds: c.supportsRefunds,
      supportsWebhooks: c.supportsWebhooks,
      isActive: c.isActive,
    }))
  }
}
