import { Body, Controller, Post, StreamableFile, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { PdfRenderService } from './pdf-render.service'
import { RenderPdfDto } from './dto/render-pdf.dto'

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly pdf: PdfRenderService) {}

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
}
