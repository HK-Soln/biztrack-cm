import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { Public } from '@/common/decorators/public.decorator'
import { RedisService } from '@/common/redis/redis.service'
import { NotificationsService } from '../services/notifications.service'
import { ResendWebhookGuard, RESEND_WEBHOOK_IDEMPOTENCY_TTL_S } from '../guards/resend-webhook.guard'
import type { ResendWebhookRequest } from '../guards/resend-webhook.guard'
import { WahaWebhookGuard } from '../guards/waha-webhook.guard'
import { RESEND_PROVIDER } from '../providers/email.provider'
import { WAHA_PROVIDER } from '../providers/whatsapp.provider'

// ─── Resend event shape ───────────────────────────────────────────────────────

interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id: string
    from?: string
    to?: string[]
    subject?: string
    attachments?: { id: string; filename: string; content_type: string }[]
    [key: string]: unknown
  }
}

// ─── WAHA event shapes ────────────────────────────────────────────────────────

/** ACK values emitted by WAHA on message.ack events */
export enum WahaAck {
  PENDING = -1,  // queued on WAHA server, not yet sent
  SERVER  = 0,   // accepted by WhatsApp servers
  DEVICE  = 1,   // delivered to recipient's device
  READ    = 2,   // read by recipient
  PLAYED  = 3,   // played (voice/video)
}

interface WahaMessageAckPayload {
  id: { _serialized: string; id: string }
  ack: WahaAck
  ackName: string
  from?: string
  to?: string
}

interface WahaWebhookEvent {
  event: string
  session: string
  payload: WahaMessageAckPayload
  engine?: string
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('notifications/webhooks')
export class NotificationsWebhookController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Resend email event webhook.
   * Signature is verified and idempotency checked by ResendWebhookGuard before this handler runs.
   */
  @Public()
  @UseGuards(ResendWebhookGuard)
  @Post('email')
  @HttpCode(HttpStatus.OK)
  async resendWebhook(
    @Req() req: ResendWebhookRequest,
    @Body() event: ResendWebhookEvent,
  ): Promise<void> {
    if (req._svixDuplicate) return

    const emailId = event?.data?.email_id
    if (!emailId) return

    switch (event.type) {
      case 'email.delivered':
        await this.notificationsService.markDelivered(emailId, RESEND_PROVIDER)
        break
      case 'email.bounced':
        await this.notificationsService.markFailedByProvider(emailId, 'bounced', RESEND_PROVIDER)
        break
      case 'email.failed':
        await this.notificationsService.markFailedByProvider(emailId, 'failed', RESEND_PROVIDER)
        break
      case 'email.complained':
        await this.notificationsService.markFailedByProvider(emailId, 'complained', RESEND_PROVIDER)
        break
      case 'email.suppressed':
        await this.notificationsService.markFailedByProvider(emailId, 'suppressed', RESEND_PROVIDER)
        break
      case 'email.received':
        await this.notificationsService.forwardInboundEmail({
          emailId,
          from: event.data.from,
          subject: event.data.subject,
        })
        break
      default:
        break
    }

    if (req._svixId) {
      await this.redisService.setex(
        `whook:resend:${req._svixId}`,
        RESEND_WEBHOOK_IDEMPOTENCY_TTL_S,
        '1',
      )
    }
  }

  /**
   * SMS provider webhook (MTN / Orange / Africa's Talking — TBD).
   */
  @Public()
  @Post('sms')
  @HttpCode(HttpStatus.OK)
  async smsWebhook(@Body() payload: Record<string, unknown>): Promise<void> {
    void payload
  }

  /**
   * WAHA (WhatsApp) webhook.
   * Signature verified by WahaWebhookGuard via HMAC-SHA256 on X-Webhook-Hmac.
   * Handles message.ack events to update notification delivery status.
   *
   * Configure in WAHA:
   *   webhooks:
   *     - url: <API_URL>/api/notifications/webhooks/whatsapp
   *       events: [message.ack]
   *       hmac:
   *         key: <WHATSAPP_WEBHOOK_SECRET>
   */
  @Public()
  @UseGuards(WahaWebhookGuard)
  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  async whatsappWebhook(@Body() event: WahaWebhookEvent): Promise<void> {
    if (event.event !== 'message.ack') return

    const messageId = event.payload?.id?._serialized
    if (!messageId) return

    switch (event.payload.ack) {
      case WahaAck.DEVICE:
      case WahaAck.READ:
      case WahaAck.PLAYED:
        await this.notificationsService.markDelivered(messageId, WAHA_PROVIDER)
        break

      case WahaAck.PENDING:
        // Still queued — no action
        break

      // WahaAck.SERVER (0) means accepted by WhatsApp but not yet on device — treat as sent
      default:
        break
    }
  }
}
