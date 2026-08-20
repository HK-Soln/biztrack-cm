import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { PdfRenderService } from './pdf-render.service'
import { ProcurementSendService } from './procurement-send.service'
import { RenderPdfDto } from './dto/render-pdf.dto'
import { SendDocumentDto } from './dto/send-document.dto'

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly pdf: PdfRenderService,
    private readonly send: ProcurementSendService,
  ) {}

  /**
   * Compile self-contained HTML (rendered client-side from a shared @biztrack/templates
   * function) to a PDF — the browser build's equivalent of the desktop's Electron
   * printToPDF. Network is blocked during render so client HTML can't trigger SSRF.
   */
  @Post('pdf')
  @ApiOperation({ summary: 'Render self-contained HTML to a downloadable PDF' })
  async renderPdf(@Body() dto: RenderPdfDto): Promise<StreamableFile> {
    const buffer = await this.pdf.render(dto.html, { blockNetwork: true })
    const name = (dto.filename ?? 'document').replace(/[^\w.-]+/g, '_')
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${name}.pdf"`,
    })
  }

  /**
   * Send an app-generated document (e.g. a contact statement) to a recipient as a PDF via
   * email or WhatsApp — the server renders + dispatches (Resend / WAHA) so the client
   * doesn't rely on a local composer. The desktop/browser falls back to download offline.
   */
  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send an HTML document to a recipient via email/WhatsApp (PDF)' })
  async sendDocument(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendDocumentDto,
  ): Promise<{ queued: true }> {
    await this.send.dispatch({
      businessId: user.businessId as string,
      html: dto.html,
      filename: dto.filename,
      message: dto.message,
      subject: dto.subject,
      channels: [dto.channel],
      phone: dto.channel === 'whatsapp' ? dto.phone : null,
      email: dto.channel === 'email' ? dto.email : null,
      blockNetwork: true,
    })
    return { queued: true }
  }
}
