import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  PaymentProviderConnectionStatus,
  ROUTABLE_PAYMENT_METHODS,
  type AvailablePaymentMethod,
  type BusinessPaymentRouteView,
  type PaymentMethod,
  type SetPaymentRouteRequest,
} from '@biztrack/types'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { BusinessPaymentRoute } from '@/entities/business-payment-route.entity'
import { PaymentProvider } from '@/entities/payment-provider.entity'
import { PaymentProviderCapability } from '@/entities/payment-provider-capability.entity'

/**
 * Spec 07 §2.3/§5 — payment routing. A route may exist only where all three verification layers
 * agree: (1) the provider has an active capability for (method, country), (2) the merchant's
 * connection is ACTIVE and its verified_methods include the method, (3) the route is enabled. This
 * turns a would-be checkout failure into a config-time message.
 */
@Injectable()
export class PaymentRoutingService {
  constructor(
    @InjectRepository(BusinessPaymentRoute)
    private readonly routes: Repository<BusinessPaymentRoute>,
    @InjectRepository(BusinessPaymentProvider)
    private readonly connections: Repository<BusinessPaymentProvider>,
    @InjectRepository(PaymentProviderCapability)
    private readonly capabilities: Repository<PaymentProviderCapability>,
    @InjectRepository(PaymentProvider)
    private readonly providers: Repository<PaymentProvider>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
  ) {}

  private async businessCountry(businessId: string): Promise<string> {
    const business = await this.businesses.findOne({ where: { id: businessId } })
    return (business?.country ?? 'CM').toUpperCase()
  }

  /** Create or update the route for a method (one provider per method). Enforces layers 1 + 2. */
  async setRoute(
    businessId: string,
    input: SetPaymentRouteRequest,
  ): Promise<BusinessPaymentRouteView> {
    if (!ROUTABLE_PAYMENT_METHODS.includes(input.paymentMethod))
      throw new AppBadRequestException(
        `${input.paymentMethod} is not a routable payment method.`,
        'PAYMENT_METHOD_NOT_ROUTABLE',
      )

    const connection = await this.connections.findOne({
      where: { id: input.providerId, businessId, deletedAt: IsNull() },
    })
    if (!connection) throw new AppNotFoundException('Provider connection not found.', 'NOT_FOUND')
    if (connection.status !== PaymentProviderConnectionStatus.ACTIVE)
      throw new AppBadRequestException(
        'The provider connection must be verified (ACTIVE) before routing to it.',
        'PAYMENT_CONNECTION_NOT_ACTIVE',
      )
    if (!connection.verifiedMethods.includes(input.paymentMethod))
      throw new AppBadRequestException(
        `The connected account is not approved for ${input.paymentMethod}.`,
        'PAYMENT_METHOD_NOT_VERIFIED',
      )

    // Webhook gate (§8): a provider with no per-request callback fallback (e.g. Stripe) must have
    // completed webhook setup before any method can be routed to it — otherwise we could never
    // confirm a payment. Providers that accept a per-request callback (MTN) are exempt.
    const provider = await this.providers.findOne({ where: { code: connection.providerCode } })
    if (provider?.requiresWebhookRegistration && connection.webhookConfiguredAt == null)
      throw new AppBadRequestException(
        `Complete webhook setup for ${connection.providerCode} before routing to it.`,
        'PAYMENT_WEBHOOK_NOT_CONFIGURED',
      )

    const country = await this.businessCountry(businessId)
    const capability = await this.capabilities.findOne({
      where: {
        providerCode: connection.providerCode,
        paymentMethod: input.paymentMethod,
        countryCode: country,
        isActive: true,
      },
    })
    if (!capability)
      throw new AppBadRequestException(
        `${connection.providerCode} cannot process ${input.paymentMethod} in ${country}.`,
        'PAYMENT_CAPABILITY_UNAVAILABLE',
      )

    // Include soft-deleted rows: a disconnected route is soft-deleted, but the unique constraint on
    // (business_id, payment_method) still holds it — so re-routing must REVIVE that row (clear
    // deleted_at), not INSERT a colliding one.
    const existing = await this.routes.findOne({
      where: { businessId, paymentMethod: input.paymentMethod },
      withDeleted: true,
    })
    const patch = {
      providerId: connection.id,
      providerCode: connection.providerCode,
      countryCode: country,
      isEnabled: input.isEnabled ?? true,
    }
    let saved: BusinessPaymentRoute
    if (existing) {
      await this.routes.update(existing.id, { ...patch, deletedAt: null })
      saved = (await this.routes.findOne({ where: { id: existing.id } }))!
    } else {
      saved = await this.routes.save(
        this.routes.create({ businessId, paymentMethod: input.paymentMethod, ...patch }),
      )
    }
    return this.toView(saved)
  }

  async listRoutes(businessId: string): Promise<BusinessPaymentRouteView[]> {
    const rows = await this.routes.find({ where: { businessId, deletedAt: IsNull() } })
    return rows.map((r) => this.toView(r))
  }

  async removeRoute(businessId: string, routeId: string): Promise<void> {
    const route = await this.routes.findOne({ where: { id: routeId, businessId } })
    if (!route) throw new AppNotFoundException('Route not found.', 'NOT_FOUND')
    await this.routes.softDelete(route.id)
  }

  /**
   * The methods a business can actually collect right now (§5.1) — enabled routes whose connection
   * is still ACTIVE and still verified for the method. The online checkout intersects this with the
   * published store snapshot flags. `CASH`/COD is not represented here (it needs no provider).
   */
  async resolveAvailableMethods(businessId: string): Promise<AvailablePaymentMethod[]> {
    const rows = await this.routes.find({
      where: { businessId, isEnabled: true, deletedAt: IsNull() },
    })
    if (rows.length === 0) return []
    const connById = new Map(
      (await this.connections.find({ where: { businessId, deletedAt: IsNull() } })).map((c) => [
        c.id,
        c,
      ]),
    )
    const available: AvailablePaymentMethod[] = []
    for (const route of rows) {
      const conn = connById.get(route.providerId)
      if (
        conn &&
        conn.status === PaymentProviderConnectionStatus.ACTIVE &&
        conn.verifiedMethods.includes(route.paymentMethod)
      ) {
        available.push({ method: route.paymentMethod, providerCode: route.providerCode })
      }
    }
    return available
  }

  /** The single provider a business routes a method to, if any (live check). Used by execution. */
  async resolveProviderForMethod(
    businessId: string,
    method: PaymentMethod,
  ): Promise<{ connection: BusinessPaymentProvider } | null> {
    const route = await this.routes.findOne({
      where: { businessId, paymentMethod: method, isEnabled: true, deletedAt: IsNull() },
    })
    if (!route) return null
    const connection = await this.connections.findOne({
      where: { id: route.providerId, businessId, deletedAt: IsNull() },
    })
    if (
      !connection ||
      connection.status !== PaymentProviderConnectionStatus.ACTIVE ||
      !connection.verifiedMethods.includes(method)
    )
      return null
    return { connection }
  }

  private toView(r: BusinessPaymentRoute): BusinessPaymentRouteView {
    return {
      id: r.id,
      paymentMethod: r.paymentMethod,
      providerId: r.providerId,
      providerCode: r.providerCode,
      countryCode: r.countryCode,
      isEnabled: r.isEnabled,
    }
  }
}
