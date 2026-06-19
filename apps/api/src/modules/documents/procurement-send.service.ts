import { Inject, Injectable } from '@nestjs/common'
import type { Logger } from '@biztrack/logger'
import { NotificationChannel, NotificationType } from '@/entities/notification.entity'
import { LOGGER } from '@/logger/logger.module'
import { NotificationsService } from '@/modules/notifications/services/notifications.service'
import { StorageService } from '@/modules/storage/storage.service'
import { PdfRenderService } from './pdf-render.service'

export type ProcurementChannel = 'email' | 'whatsapp'

export interface ProcurementDispatchInput {
  businessId: string
  /** Full HTML document (from @biztrack/templates) to render to PDF. */
  html: string
  /** Plain-text body for the message; the stored PDF link is appended. */
  message: string
  /** File name (without extension) for the stored PDF. */
  filename: string
  subject: string
  channels: ProcurementChannel[]
  phone?: string | null
  email?: string | null
}

/**
 * Renders a procurement document (RFQ/PO) to PDF, stores it, and dispatches it to the
 * supplier via WhatsApp and/or email (a link to the stored PDF). Used by the cloud
 * "send" endpoints; the desktop app shares locally instead. Notifications go through
 * the existing async pipeline (Resend / WAHA).
 */
@Injectable()
export class ProcurementSendService {
  constructor(
    private readonly pdf: PdfRenderService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ProcurementSendService')
  }

  /** Render a document's HTML to a PDF buffer (for download / blob endpoints). */
  renderPdf(html: string): Promise<Buffer> {
    return this.pdf.render(html)
  }

  async dispatch(input: ProcurementDispatchInput): Promise<{ pdfUrl: string }> {
    const pdf = await this.pdf.render(input.html)
    const stored = await this.storage.upload({
      buffer: pdf,
      contentType: 'application/pdf',
      originalName: `${input.filename}.pdf`,
      folder: 'procurement',
    })
    const body = `${input.message}\n\n${stored.url}`

    // NOTE: reuses PAYMENT_REMINDER notification type (supplier-facing business message)
    // to avoid a non-transactional enum migration; metadata marks it as procurement.
    if (input.channels.includes('whatsapp') && input.phone) {
      await this.notifications.createAndEnqueue({
        channel: NotificationChannel.WHATSAPP,
        type: NotificationType.PAYMENT_REMINDER,
        recipient: input.phone,
        body,
        businessId: input.businessId,
        metadata: { kind: 'procurement', pdfUrl: stored.url },
      })
    }
    if (input.channels.includes('email') && input.email) {
      await this.notifications.createAndEnqueue({
        channel: NotificationChannel.EMAIL,
        type: NotificationType.PAYMENT_REMINDER,
        recipient: input.email,
        subject: input.subject,
        body,
        businessId: input.businessId,
        metadata: { kind: 'procurement', pdfUrl: stored.url },
      })
    }
    return { pdfUrl: stored.url }
  }
}
