import { Module } from '@nestjs/common'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { PdfRenderService } from './pdf-render.service'
import { ProcurementSendService } from './procurement-send.service'

/**
 * Document generation + delivery for procurement (RFQ/PO): renders the shared
 * templates to PDF via headless Chromium and dispatches them to suppliers. StorageService
 * is global; NotificationsModule provides the dispatch pipeline.
 */
@Module({
  imports: [NotificationsModule],
  providers: [PdfRenderService, ProcurementSendService],
  exports: [ProcurementSendService],
})
export class DocumentsModule {}
