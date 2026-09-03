import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  BusinessMemberRole,
  type AuditContext,
  type BusinessPaymentProviderView,
  type ConnectPaymentProviderResponse,
  type JwtPayload,
  type PaymentProvider,
  type PaymentProviderCapability,
} from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { AppForbiddenException } from '@/common/exceptions/app-exceptions'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { PaymentCatalogueService } from '../services/payment-catalogue.service'
import { PaymentCredentialsService } from '../services/payment-credentials.service'
import { ConnectProviderDto } from '../dto/connect-provider.dto'

/**
 * Spec 07 §2/§10 — owner-only payment provider configuration. The credential API is WRITE-ONLY: no
 * endpoint ever returns a secret. Reads return only provider, last-four, fingerprint, status and
 * verification metadata. Every credential change is audited and (client-side) PIN-step-up gated.
 */
@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('payments')
export class PaymentProvidersController {
  constructor(
    private readonly catalogue: PaymentCatalogueService,
    private readonly credentials: PaymentCredentialsService,
  ) {}

  private assertOwner(user: JwtPayload): void {
    if (user.role !== BusinessMemberRole.OWNER) {
      throw new AppForbiddenException('Only the business owner can manage payments.', 'FORBIDDEN')
    }
  }

  @Get('providers')
  @ApiOperation({ summary: 'List the provider catalogue (owner-only)' })
  listProviders(@CurrentUser() user: JwtPayload): Promise<PaymentProvider[]> {
    this.assertOwner(user)
    return this.catalogue.listProviders()
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Active provider capabilities for a country (owner-only)' })
  listCapabilities(
    @CurrentUser() user: JwtPayload,
    @Query('country') country?: string,
  ): Promise<PaymentProviderCapability[]> {
    this.assertOwner(user)
    return this.catalogue.listCapabilities((country ?? 'CM').toUpperCase())
  }

  @Get('connections')
  @ApiOperation({ summary: "The business's provider connections — masked, never a secret" })
  listConnections(@CurrentUser() user: JwtPayload): Promise<BusinessPaymentProviderView[]> {
    this.assertOwner(user)
    return this.credentials.listForBusiness(user.businessId as string)
  }

  @Post('connections')
  @ApiOperation({ summary: 'Connect or rotate a provider (owner-only, write-only)' })
  async connect(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConnectProviderDto,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<ConnectPaymentProviderResponse> {
    this.assertOwner(user)
    const connection = await this.credentials.connect(
      user.businessId as string,
      user.sub,
      dto,
      context,
    )
    return { connection }
  }

  @Delete('connections/:id')
  @ApiOperation({ summary: 'Revoke a provider connection (owner-only)' })
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<BusinessPaymentProviderView> {
    this.assertOwner(user)
    return this.credentials.revoke(user.businessId as string, id, context)
  }
}
