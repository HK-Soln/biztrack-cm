import { Controller, HttpCode, HttpStatus, Param, Put } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { Public } from '@/common/decorators/public.decorator'
import { RawResponse } from '@/common/decorators/raw-response.decorator'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { PaymentInitiationService } from '../services/payment-initiation.service'

/**
 * Spec 07 §8 — MTN MoMo callback (PUT). MTN has no webhook signature/HMAC, so the tenant is resolved
 * from the signed per-connection token in the URL path (never the payload) and the reference is the
 * attempt's X-Reference-Id. The callback is only a TRIGGER — we re-read authoritative status via
 * getTransaction (reconcileByRef). Always ack (Public + throttle-exempt + raw 'ok') so a retry can't
 * storm, and never leak whether a token/reference exists.
 */
@Controller('webhooks/payments')
export class MomoCallbackController {
  constructor(
    @InjectRepository(BusinessPaymentProvider)
    private readonly connections: Repository<BusinessPaymentProvider>,
    private readonly initiation: PaymentInitiationService,
  ) {}

  @Put('momo/:webhookToken/:reference')
  @Public()
  @SkipThrottle()
  @RawResponse()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('webhookToken') webhookToken: string,
    @Param('reference') reference: string,
  ): Promise<string> {
    const conn = await this.connections.findOne({
      where: { webhookToken, providerCode: 'MTN', deletedAt: IsNull() },
    })
    if (conn) await this.initiation.reconcileByRef(conn.businessId, reference)
    return 'ok'
  }
}
