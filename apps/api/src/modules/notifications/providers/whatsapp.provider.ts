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
   * If the notification carries a document attachment (metadata.attachments), it is sent
   * as a WhatsApp document with the body as caption. Sending documents requires the WAHA
   * Plus engine; on engines that reject it (free Core/WEBJS returns 422) we gracefully
   * fall back to a text message with a link to the PDF so the recipient still gets it.
   */
  async send(notification: Notification): Promise<WhatsAppSendResult> {
    const chatId = this.toChatId(notification.recipient)
    const doc = this.extractDocument(notification)

    try {
      let result
      let withDocument = false
      if (doc) {
        try {
          result = await this.waha.sendFile({
            chatId,
            file: { url: doc.url, filename: doc.filename, mimetype: doc.mimetype ?? 'application/pdf' },
            caption: notification.body,
          })
          withDocument = true
        } catch (fileErr) {
          this.logger.warn(
            'WhatsApp document send failed — falling back to text + link',
            'WhatsAppProvider',
            { notificationId: notification.id, err: fileErr instanceof Error ? fileErr.message : String(fileErr) },
          )
          result = await this.waha.sendText({ chatId, text: this.withLink(notification.body, doc.url) })
        }
      } else {
        result = await this.waha.sendText({ chatId, text: notification.body })
      }

      this.logger.log(`WhatsApp notification sent`, 'WhatsAppProvider', {
        notificationId: notification.id,
        wahaMessageId: result.id,
        withDocument,
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

  /** Append a document link to a message body (fallback when documents can't be sent). */
  private withLink(body: string, url: string): string {
    return body?.trim() ? `${body}\n\n${url}` : url
  }

  /** Pull the first document attachment (a hosted PDF URL) off a notification's metadata. */
  private extractDocument(
    notification: Notification,
  ): { url: string; filename: string; mimetype?: string } | null {
    const raw = (notification.metadata as { attachments?: unknown } | null)?.attachments
    if (!Array.isArray(raw)) return null
    for (const a of raw) {
      const url = (a as { path?: string }).path
      const filename = (a as { filename?: string }).filename
      if (typeof url === 'string' && typeof filename === 'string') {
        return { url, filename, mimetype: (a as { content_type?: string }).content_type }
      }
    }
    return null
  }
}
