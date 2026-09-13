import { Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { PaymentConfirmationType } from '@biztrack/types'
import { Public } from '@/common/decorators/public.decorator'
import { RawResponse } from '@/common/decorators/raw-response.decorator'
import { RedisService } from '@/common/redis/redis.service'
import { PaymentAdapterRegistry } from '../adapters/adapter.registry'
import { PaymentAttemptsService } from '../services/payment-attempts.service'
import { PaymentWebhookGuard, type PaymentWebhookRequest } from '../guards/payment-webhook.guard'

/** Idempotency window for a provider event id (24h), mirroring the Resend webhook convention. */
const WEBHOOK_IDEMPOTENCY_TTL_S = 86_400

/**
 * Spec 07 §8 — inbound payment provider webhooks. Public + signature-gated (guard) + throttle-exempt
 * (@SkipThrottle, so a retry storm from one IP isn't dropped) + @RawResponse (a literal `ok` ack,
 * not the success envelope). Tenant resolves from the opaque webhook_token, never the payload.
 * Reuses the global raw-body capture and the Redis `whook:<provider>:<event-id>` idempotency pattern.
 * Fast path: verify → idempotency → apply → 200. Applying is idempotent (terminal states never
 * regress), so a duplicate that races the idempotency key is still safe.
 */
@Controller('webhooks/payments')
export class PaymentWebhookController {
  constructor(
    private readonly redis: RedisService,
    private readonly attempts: PaymentAttemptsService,
    private readonly adapters: PaymentAdapterRegistry,
  ) {}

  @Post(':providerCode/:webhookToken')
  @Public()
  @SkipThrottle()
  @RawResponse()
  @HttpCode(HttpStatus.OK)
  @UseGuards(PaymentWebhookGuard)
  async handle(@Req() req: PaymentWebhookRequest): Promise<string> {
    const conn = req.paymentConnection!
    const adapter = this.adapters.get(conn.providerCode)!
    const event = adapter.parseWebhook(req.rawBody as Buffer)

    const key = `whook:${conn.providerCode.toLowerCase()}:${event.eventId}`
    if (await this.redis.get(key)) return 'ok' // already processed — ack, don't reprocess

    await this.attempts.applyProviderEvent(conn.businessId, event, PaymentConfirmationType.WEBHOOK)
    await this.redis.setex(key, WEBHOOK_IDEMPOTENCY_TTL_S, '1')
    return 'ok'
  }
}
