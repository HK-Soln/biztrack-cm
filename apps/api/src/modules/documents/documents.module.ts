import { Module } from '@nestjs/common'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { PdfRenderService } from './pdf-render.service'
import { ProcurementSendService } from './procurement-send.service'
import { DocumentsController } from './documents.controller'

/**
 * Document generation + delivery for procurement (RFQ/PO): renders the shared
 * templates to PDF via headless Chromium and dispatches them to suppliers. StorageService
 * is global; NotificationsModule provides the dispatch pipeline. Also exposes a generic
 * HTML→PDF endpoint for the browser build's downloads.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [DocumentsController],
  providers: [PdfRenderService, ProcurementSendService],
  exports: [ProcurementSendService],
})
export class DocumentsModule {}
