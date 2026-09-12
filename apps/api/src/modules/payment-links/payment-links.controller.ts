import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { type JwtPayload, type PaymentLinkView } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { PaymentLinkService } from './payment-link.service'
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto'
import { CreateSaleDraftLinkDto } from './dto/create-sale-draft-link.dto'
import { CreateGeneralLinkDto } from './dto/create-general-link.dto'

/**
 * Spec 08 — merchant-facing payment-link management (authed). Create a shareable link for a payable
 * (debt / sale balance / online order / deposit), list them, cancel. The public pay flow (by token)
 * is a separate controller.
 */
@ApiTags('payment-links')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('payment-links')
export class PaymentLinksController {
  constructor(private readonly service: PaymentLinkService) {}

  @Post()
  @ApiOperation({ summary: 'Create a payment link for a payable' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePaymentLinkDto,
  ): Promise<PaymentLinkView> {
    return this.service.create(user.businessId as string, user.sub, dto)
  }

  @Post('sale-draft')
  @ApiOperation({ summary: 'Create a SALE_DRAFT intent (sale materializes on payment) — Spec 09' })
  createSaleDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSaleDraftLinkDto,
  ): Promise<PaymentLinkView> {
    return this.service.createSaleDraft(user.businessId as string, user.sub, dto)
  }

  @Post('general')
  @ApiOperation({ summary: 'Create a GENERAL link (booked as other income on payment) — Spec 10' })
  createGeneral(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGeneralLinkDto,
  ): Promise<PaymentLinkView> {
    return this.service.createGeneral(user.businessId as string, user.sub, dto)
  }

  @Get()
  @ApiOperation({ summary: "The business's payment links (newest first)" })
  list(@CurrentUser() user: JwtPayload): Promise<PaymentLinkView[]> {
    return this.service.list(user.businessId as string)
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a payment link' })
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.service.cancel(user.businessId as string, id)
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: 'Finish collecting; leave the balance as the customer’s credit (§4)' })
  finalize(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<PaymentLinkView> {
    return this.service.finalize(user.businessId as string, id)
  }
}
