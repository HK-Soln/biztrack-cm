import { Inject, Injectable } from '@nestjs/common'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { Notification } from '@/entities/notification.entity'
import { WhatsAppProvider } from './whatsapp.provider'

export const SMS_PROVIDER = 'waha_sms'

export interface SmsSendResult {
  providerMessageId?: string
  provider: string
}

@Injectable()
export class SmsProvider {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly whatsApp: WhatsAppProvider,
  ) {
    this.logger.setContext('SmsProvider')
  }

  /**
   * Send an SMS notification.
   *
   * Using WAHA (WhatsApp) as the SMS transport until a dedicated SMS contract
   * (MTN, Orange, or Africa's Talking) is finalised.
   */
  async send(notification: Notification): Promise<SmsSendResult> {
    this.logger.log('Routing SMS via WhatsApp (WAHA)', 'SmsProvider', {
      notificationId: notification.id,
      recipient: notification.recipient,
    })

    const result = await this.whatsApp.send(notification)

    return { providerMessageId: result.providerMessageId, provider: SMS_PROVIDER }
  }
}
