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
  /** Full HTML document (from @biztrack/templates) to render + attach as PDF. When absent
   * a plain text/email message is sent with no attachment. */
  html?: string | null
  /** Plain-text body for the message; the PDF (if any) rides as an attachment, not a link. */
  message: string
  /** File name (without extension) for the stored PDF. */
  filename?: string | null
  subject: string
  channels: ProcurementChannel[]
  phone?: string | null
  email?: string | null
  /** Block network during PDF render — set when the HTML came from a client (anti-SSRF). */
  blockNetwork?: boolean
}

/**
 * Renders a procurement document (RFQ/PO/receipt) to PDF, stores it, and dispatches it to
 * the recipient via WhatsApp and/or email with the PDF as a real attachment/document. Used
 * by the cloud "send" endpoints; the desktop app shares locally instead. Notifications go
 * through the existing async pipeline (Resend / WAHA).
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

  async dispatch(input: ProcurementDispatchInput): Promise<{ pdfUrl: string | null }> {
    // Render + store the PDF only when an HTML document was provided; otherwise this is a
    // plain text/email message (e.g. a payment reminder without the statement attached).
    let pdfUrl: string | null = null
    let emailAttachment: { filename: string; content: string; content_type: string } | undefined
    let waAttachment: { filename: string; path: string; content_type: string } | undefined
    if (input.html) {
      const pdf = await this.pdf.render(input.html, { blockNetwork: input.blockNetwork ?? false })
      const stored = await this.storage.upload({
        buffer: pdf,
        contentType: 'application/pdf',
        originalName: `${input.filename ?? 'document'}.pdf`,
        folder: 'documents',
      })
      pdfUrl = stored.url
      // The PDF rides as a real attachment (email) / document (WhatsApp), not a link in the
      // body. Providers read `metadata.attachments`. Email gets the PDF inline as base64
      // (Resend refuses to fetch localhost/private URLs); WhatsApp gets the hosted URL for
      // WAHA to fetch (falling back to a text link when the engine can't send documents).
      const filename = `${input.filename ?? 'document'}.pdf`
      emailAttachment = {
        filename,
        content: pdf.toString('base64'),
        content_type: 'application/pdf',
      }
      waAttachment = { filename, path: stored.url, content_type: 'application/pdf' }
    }

    // NOTE: reuses PAYMENT_REMINDER notification type (business→contact message) to avoid a
    // non-transactional enum migration; metadata marks the source.
    if (input.channels.includes('whatsapp') && input.phone) {
      await this.notifications.createAndEnqueue({
        channel: NotificationChannel.WHATSAPP,
        type: NotificationType.PAYMENT_REMINDER,
        recipient: input.phone,
        body: input.message,
        businessId: input.businessId,
        metadata: waAttachment
          ? { kind: 'document', pdfUrl, attachments: [waAttachment] }
          : { kind: 'message' },
      })
    }
    if (input.channels.includes('email') && input.email) {
      await this.notifications.createAndEnqueue({
        channel: NotificationChannel.EMAIL,
        type: NotificationType.PAYMENT_REMINDER,
        recipient: input.email,
        subject: input.subject,
        body: input.message,
        businessId: input.businessId,
        metadata: emailAttachment
          ? { kind: 'document', pdfUrl, attachments: [emailAttachment] }
          : { kind: 'message' },
      })
    }
    return { pdfUrl }
  }
}
