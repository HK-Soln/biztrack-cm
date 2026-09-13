import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { SalesService } from '../services/sales.service'

/**
 * Public digital receipt — the QR on a printed receipt links here. Unauthenticated: the sale id (an
 * unguessable UUID) is the capability. Returns the rendered receipt HTML (the same shared template
 * that prints, with the business's settings, minus the QR). Consumed by apps/storefront's /r page.
 */
@ApiTags('Public receipt')
@Controller('public/receipts')
export class PublicReceiptController {
  constructor(private readonly sales: SalesService) {}

  @Get(':saleId')
  @ApiOperation({ summary: 'Rendered receipt HTML for a sale (digital receipt)' })
  async getReceiptHtml(
    @Param('saleId') saleId: string,
    @Query('locale') locale?: string,
  ): Promise<{ html: string }> {
    const html = await this.sales.renderPublicReceipt(saleId, locale?.trim() || 'fr')
    if (!html) {
      throw new AppNotFoundException('Receipt not found.', 'RECEIPT_NOT_FOUND')
    }
    return { html }
  }
}
