import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  BusinessMemberRole,
  type AuditContext,
  type AvailablePaymentMethod,
  type BusinessPaymentProviderView,
  type BusinessPaymentRouteView,
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
import { PaymentVerificationService } from '../services/payment-verification.service'
import { PaymentRoutingService } from '../services/payment-routing.service'
import { ConnectProviderDto } from '../dto/connect-provider.dto'
import { ConfigureWebhookDto } from '../dto/configure-webhook.dto'
import { SetRouteDto } from '../dto/set-route.dto'

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
    private readonly verification: PaymentVerificationService,
    private readonly routing: PaymentRoutingService,
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
    const businessId = user.businessId as string
    const connection = await this.credentials.connect(businessId, user.sub, dto, context)
    // Verify immediately so the merchant sees ACTIVE/FAILED at once; best-effort (a provider/network
    // error leaves it PENDING/PROVIDER_UNAVAILABLE and the daily sweep retries).
    try {
      return { connection: await this.verification.verify(businessId, connection.id) }
    } catch {
      return { connection }
    }
  }

  @Post('connections/:id/verify')
  @ApiOperation({ summary: 'Re-verify a provider connection now (owner-only)' })
  verify(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<BusinessPaymentProviderView> {
    this.assertOwner(user)
    return this.verification.verify(user.businessId as string, id)
  }

  @Post('connections/:id/webhook')
  @ApiOperation({ summary: 'Complete webhook setup for a connection — step 2 (owner-only)' })
  configureWebhook(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ConfigureWebhookDto,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<BusinessPaymentProviderView> {
    this.assertOwner(user)
    return this.credentials.configureWebhook(user.businessId as string, id, dto, context)
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

  // --- Routing (§2.3) -------------------------------------------------------

  @Get('routes')
  @ApiOperation({ summary: "The business's payment routes (owner-only)" })
  listRoutes(@CurrentUser() user: JwtPayload): Promise<BusinessPaymentRouteView[]> {
    this.assertOwner(user)
    return this.routing.listRoutes(user.businessId as string)
  }

  @Put('routes')
  @ApiOperation({ summary: 'Route a method to a verified provider (one provider per method)' })
  setRoute(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetRouteDto,
  ): Promise<BusinessPaymentRouteView> {
    this.assertOwner(user)
    return this.routing.setRoute(user.businessId as string, dto)
  }

  @Delete('routes/:id')
  @ApiOperation({ summary: 'Remove a payment route (owner-only)' })
  async removeRoute(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    this.assertOwner(user)
    await this.routing.removeRoute(user.businessId as string, id)
    return { success: true }
  }

  @Get('available-methods')
  @ApiOperation({
    summary: 'Methods the business can actually collect now (passed the 3-layer check)',
  })
  availableMethods(@CurrentUser() user: JwtPayload): Promise<AvailablePaymentMethod[]> {
    this.assertOwner(user)
    return this.routing.resolveAvailableMethods(user.businessId as string)
  }
}
