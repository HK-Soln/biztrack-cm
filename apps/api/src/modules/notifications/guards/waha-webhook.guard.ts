import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, timingSafeEqual } from 'crypto'
import type { Request } from 'express'
import type { AppConfig } from '@/config/configuration'

export interface WahaWebhookRequest extends Request {
  rawBody?: Buffer
}

@Injectable()
export class WahaWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get('WHATSAPP_WEBHOOK_SECRET', { infer: true })

    // If no secret is configured, skip verification (useful in local dev)
    if (!secret) return true

    const req = context.switchToHttp().getRequest<WahaWebhookRequest>()

    const rawBody = req.rawBody
    if (!rawBody) throw new UnauthorizedException('Missing raw body')

    const received = req.headers['x-webhook-hmac']
    if (!received || typeof received !== 'string') {
      throw new UnauthorizedException('Missing X-Webhook-Hmac header')
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')

    const expectedBuf = Buffer.from(expected, 'utf8')
    const receivedBuf = Buffer.from(received, 'utf8')

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException('Invalid WAHA webhook signature')
    }

    return true
  }
}
