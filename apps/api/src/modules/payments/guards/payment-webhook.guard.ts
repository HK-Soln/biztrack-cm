import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import type { Request } from 'express'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { PaymentAdapterRegistry } from '../adapters/adapter.registry'
import { PaymentCredentialsService } from '../services/payment-credentials.service'

export interface PaymentWebhookRequest extends Request {
  rawBody?: Buffer
  /** Attached by the guard once the tenant + signature are verified. */
  paymentConnection?: BusinessPaymentProvider
}

/**
 * Spec 07 §8 — payment webhook guard. Resolves the tenant from the opaque `webhook_token` in the URL
 * (NEVER from the payload); an unknown token is a 404 with no detail. Then verifies the provider's
 * signature via the adapter, using the merchant's decrypted credentials. Reuses the WAHA/Resend
 * raw-body + HMAC pattern.
 */
@Injectable()
export class PaymentWebhookGuard implements CanActivate {
  constructor(
    @InjectRepository(BusinessPaymentProvider)
    private readonly connections: Repository<BusinessPaymentProvider>,
    private readonly credentials: PaymentCredentialsService,
    private readonly adapters: PaymentAdapterRegistry,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PaymentWebhookRequest>()
    const providerCode = String(req.params.providerCode ?? '')
    const webhookToken = String(req.params.webhookToken ?? '')
    if (!webhookToken) throw new NotFoundException()

    const conn = await this.connections.findOne({
      where: { webhookToken, deletedAt: IsNull() },
    })
    // Unknown token, or a token that doesn't match the URL's provider → 404, no detail.
    if (!conn || conn.providerCode.toUpperCase() !== providerCode.toUpperCase()) {
      throw new NotFoundException()
    }

    const adapter = this.adapters.get(conn.providerCode)
    if (!adapter) throw new NotFoundException()

    const rawBody = req.rawBody
    if (!rawBody) throw new UnauthorizedException('Missing raw body')

    const creds = await this.credentials.getDecryptedCredentials(conn.businessId, conn.providerCode)
    if (!creds) throw new UnauthorizedException('No credentials')

    if (!adapter.verifyWebhookSignature(rawBody, req.headers as Record<string, unknown>, creds)) {
      throw new UnauthorizedException('Invalid webhook signature')
    }

    req.paymentConnection = conn
    return true
  }
}
