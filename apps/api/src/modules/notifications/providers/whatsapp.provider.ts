import { Inject, Injectable } from '@nestjs/common'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { Notification } from '@/entities/notification.entity'
import { AppInternalServerException } from '@/common/exceptions/app-exceptions'
import { WahaHttpClient } from './waha-http.client'

export const WAHA_PROVIDER = 'waha'

export interface WhatsAppSendResult {
  providerMessageId?: string
  provider: string
}

@Injectable()
export class WhatsAppProvider {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly waha: WahaHttpClient,
  ) {
    this.logger.setContext('WhatsAppProvider')
  }

  /**
   * Format a phone number to WAHA chatId format.
   * Input: +237650123456  →  Output: 237650123456@c.us
   */
  private toChatId(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    return `${digits}@c.us`
  }

  /**
   * Check whether a phone number is registered on WhatsApp.
   * Returns true if the number exists, false if it does not.
   * Throws if the WAHA server is unreachable or returns an unexpected error.
   */
  async isWhatsAppContact(phone: string): Promise<boolean> {
    const digits = phone.replace(/\D/g, '')

    try {
      const result = await this.waha.checkContactExists(digits)
      return result.numberExists
    } catch (err) {
      this.logger.error(`Failed to check WhatsApp contact existence for ${digits}`, WhatsAppProvider.name, { err })
      throw new AppInternalServerException('Failed to check WhatsApp contact')
    }
  }

  /**
   * Send a plain text message to a WhatsApp number.
   */
  async sendMessage(phone: string, text: string): Promise<void> {
    const chatId = this.toChatId(phone)

    try {
      await this.waha.sendText({ chatId, text })
      this.logger.log(`WhatsApp message sent to ${chatId}`)
    } catch (err) {
      this.logger.error(`Failed to send WhatsApp message to ${chatId}`, WhatsAppProvider.name, { err })
      throw new AppInternalServerException('Failed to send WhatsApp message')
    }
  }

  /**
   * Send an OTP code.
   */
  async sendOtp(phone: string, code: string, expiryMins: number): Promise<void> {
    const text = `Your verification code is: *${code}*\n\nThis code expires in ${expiryMins} minutes. Do not share it with anyone.`
    await this.sendMessage(phone, text)
  }

  /**
   * Send a WhatsApp notification from a persisted Notification record.
   * Routes to text-only for now; extend to image/file/voice/video as needed.
   */
  async send(notification: Notification): Promise<WhatsAppSendResult> {
    const chatId = this.toChatId(notification.recipient)

    try {
      console.log('Sending whatsapp notification')
      const result = await this.waha.sendText({
        chatId,
        text: notification.body,
      })

      this.logger.log(`WhatsApp notification sent`, 'WhatsAppProvider', {
        notificationId: notification.id,
        wahaMessageId: result.id,
      })

      return { providerMessageId: result.id, provider: WAHA_PROVIDER }
    } catch (err) {
      console.log(err)
      this.logger.error(`Failed to send WhatsApp notification`, 'WhatsAppProvider', {
        notificationId: notification.id,
        err,
      })
      throw new AppInternalServerException('Failed to send WhatsApp notification')
    }
  }
}
