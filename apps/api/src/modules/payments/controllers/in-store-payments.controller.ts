import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  BusinessMemberRole,
  type InStoreOverrideSummaryRow,
  type InStorePaymentInitiated,
  type InStorePaymentStatus,
  type JwtPayload,
} from '@biztrack/types'
import { majorToMinor } from '@biztrack/utils'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { PaymentInitiationService } from '../services/payment-initiation.service'
import { PaymentReconciliationService } from '../services/payment-reconciliation.service'
import { InitiateInStorePaymentDto } from '../dto/initiate-in-store-payment.dto'

/**
 * Spec 07 §7 (Build 10) — in-store (POS) provider payments. Authenticated cashier context (any role,
 * not owner-only): start a MoMo push / card link at the till and poll it to a terminal state. No Sale
 * is created here — the client holds the cart and posts the Sale on confirmation, carrying the returned
 * providerRef (+ attempt id) on the payment line.
 */
@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('payments/in-store')
export class InStorePaymentsController {
  constructor(
    private readonly initiation: PaymentInitiationService,
    private readonly reconciliation: PaymentReconciliationService,
  ) {}

  @Get('override-summary')
  @ApiOperation({ summary: 'Per-cashier manual hard-confirm tally (§7.6 → BIZ-2.11, owner/manager)' })
  overrideSummary(@CurrentUser() user: JwtPayload): Promise<InStoreOverrideSummaryRow[]> {
    if (
      ![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(
        user.role as BusinessMemberRole,
      )
    ) {
      throw new AppForbiddenException('Only a manager can view overrides.', 'FORBIDDEN')
    }
    return this.reconciliation.manualOverrideSummary(user.businessId as string)
  }

  @Post('initiate')
  @ApiOperation({ summary: 'Start a provider payment at the till (MoMo push / card link)' })
  async initiate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateInStorePaymentDto,
  ): Promise<InStorePaymentInitiated> {
    const businessId = user.businessId as string
    const currency = (dto.currency ?? 'XAF').toUpperCase()
    const initiated = await this.initiation.initiateInStorePayment({
      businessId,
      method: dto.method,
      amountMinor: majorToMinor(dto.amount, currency),
      currency,
      // Space-free reference — it becomes the provider externalId (MoMo rejects spaces with a 400).
      reference: dto.reference?.trim().replace(/\s+/g, '-') || `POS-${dto.clientReference.slice(0, 8)}`,
      customerPhone: dto.customerPhone,
      cashSessionId: dto.cashSessionId,
      clientReference: dto.clientReference,
    })
    if (!initiated) {
      throw new AppBadRequestException(
        'No payment provider is set up for this method.',
        'PAYMENT_METHOD_NOT_ROUTABLE',
      )
    }
    const base = {
      attemptId: initiated.attemptId,
      kind: initiated.kind,
      providerRef: initiated.providerRef,
    }
    return initiated.kind === 'redirect'
      ? { ...base, url: initiated.url, expiresAt: initiated.expiresAt }
      : base
  }

  @Get(':attemptId/status')
  @ApiOperation({ summary: 'Poll an in-store payment attempt' })
  async status(
    @CurrentUser() user: JwtPayload,
    @Param('attemptId') attemptId: string,
  ): Promise<InStorePaymentStatus> {
    const state = await this.initiation.getInStorePaymentStatus(user.businessId as string, attemptId)
    if (!state) {
      throw new AppNotFoundException('Payment attempt not found.', 'PAYMENT_ATTEMPT_NOT_FOUND')
    }
    return { status: state.status, reason: state.reason, providerRef: state.providerRef }
  }

  @Post(':attemptId/confirm')
  @ApiOperation({ summary: 'Manager override: hard-confirm a pending in-store attempt (§7.6)' })
  confirm(
    @CurrentUser() user: JwtPayload,
    @Param('attemptId') attemptId: string,
  ): Promise<InStorePaymentStatus> {
    return this.manualSettle(user, attemptId, 'confirm')
  }

  @Post(':attemptId/fail')
  @ApiOperation({ summary: 'Manager override: mark a pending in-store attempt failed (§7.6)' })
  fail(
    @CurrentUser() user: JwtPayload,
    @Param('attemptId') attemptId: string,
  ): Promise<InStorePaymentStatus> {
    return this.manualSettle(user, attemptId, 'fail')
  }

  /** Manual overrides are owner/manager-only (audited on the attempt via confirmationType=MANUAL +
   *  confirmedBy). Cashier-with-step-up authorization is a future refinement. */
  private async manualSettle(
    user: JwtPayload,
    attemptId: string,
    action: 'confirm' | 'fail',
  ): Promise<InStorePaymentStatus> {
    if (
      ![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(
        user.role as BusinessMemberRole,
      )
    ) {
      throw new AppForbiddenException('Only a manager can override a payment.', 'FORBIDDEN')
    }
    const state = await this.initiation.manualSettleInStore(
      user.businessId as string,
      attemptId,
      action,
      user.sub,
    )
    if (!state) {
      throw new AppNotFoundException('Payment attempt not found.', 'PAYMENT_ATTEMPT_NOT_FOUND')
    }
    return { status: state.status, providerRef: state.providerRef }
  }
}
