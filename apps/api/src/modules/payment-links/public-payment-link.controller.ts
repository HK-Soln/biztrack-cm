import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  type InitiatePaymentLinkResult,
  type PaymentLinkPaymentStatus,
  type PublicPaymentLink,
} from '@biztrack/types'
import { PublicPaymentLinkService } from './public-payment-link.service'
import { InitiatePaymentLinkDto } from './dto/initiate-payment-link.dto'

/**
 * Spec 08 §6.2 — the public (payer) pay-by-token API. No auth: the link token IS the authorization
 * (same trust model as the storefront tracking token). Consumed by the public /pay/[token] page.
 */
@ApiTags('Public payment links')
@Controller('public/pay')
export class PublicPaymentLinkController {
  constructor(private readonly service: PublicPaymentLinkService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Resolve a payment link by token (live amount, methods, status)' })
  get(@Param('token') token: string): Promise<PublicPaymentLink> {
    return this.service.getPublic(token)
  }

  @Post(':token/initiate')
  @ApiOperation({ summary: 'Start a payment for a link (card link / MoMo push)' })
  initiate(
    @Param('token') token: string,
    @Body() dto: InitiatePaymentLinkDto,
  ): Promise<InitiatePaymentLinkResult> {
    return this.service.initiate(token, dto)
  }

  @Get(':token/status')
  @ApiOperation({ summary: 'Poll a link payment' })
  status(@Param('token') token: string): Promise<PaymentLinkPaymentStatus> {
    return this.service.status(token)
  }
}
