import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import {
  PaymentMethod,
  type AddCartItemRequest,
  type CheckoutRequest,
  type OnlineCart as OnlineCartShape,
  type OnlineCartItem,
  type OnlineOrderStatus,
  type PublicOrderTracking,
  type SaleSyncPayload,
  type UpdateOrderStatusRequest,
} from '@biztrack/types'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { OnlineCart } from '@/entities/online-cart.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { OnlineOrderEvent } from '@/entities/online-order-event.entity'
import { OnlineStore } from '@/entities/online-store.entity'
import { Product } from '@/entities/product.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { SalesService } from '@/modules/sales/services/sales.service'

const cartItemKey = (item: { productId: string; variantId?: string | null; serialUnitId?: string | null }) =>
  `${item.productId}:${item.variantId ?? ''}:${item.serialUnitId ?? ''}`

const STATUS_EVENT: Record<OnlineOrderStatus, { type: OnlineOrderEvent['eventType']; message: string }> = {
  PENDING: { type: 'ORDER_PLACED', message: 'Your order has been placed.' },
  CONFIRMED: { type: 'ORDER_CONFIRMED', message: 'Your order has been confirmed.' },
  PREPARING: { type: 'PREPARATION_STARTED', message: 'Your order is being prepared.' },
  DISPATCHED: { type: 'ORDER_DISPATCHED', message: 'Your order is on its way.' },
  DELIVERED: { type: 'ORDER_DELIVERED', message: 'Your order has been delivered.' },
  CANCELLED: { type: 'ORDER_CANCELLED', message: 'Your order has been cancelled.' },
  REFUNDED: { type: 'ORDER_REFUNDED', message: 'Your order has been refunded.' },
}

@Injectable()
export class OnlineOrdersService {
  constructor(
    @InjectRepository(OnlineCart)
    private readonly cartsRepo: Repository<OnlineCart>,
    @InjectRepository(OnlineOrder)
    private readonly ordersRepo: Repository<OnlineOrder>,
    @InjectRepository(OnlineOrderEvent)
    private readonly eventsRepo: Repository<OnlineOrderEvent>,
    @InjectRepository(OnlineStore)
    private readonly storesRepo: Repository<OnlineStore>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    private readonly salesService: SalesService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('OnlineOrdersService')
  }

  // ---- Cart ---------------------------------------------------------------

  async getCart(slug: string, sessionToken: string): Promise<OnlineCartShape> {
    const store = await this.requireStore(slug)
    const cart = await this.cartsRepo.findOne({
      where: { onlineStoreId: store.id, sessionToken },
    })
    return this.toCartShape(cart, sessionToken)
  }

  async addItem(slug: string, sessionToken: string | undefined, dto: AddCartItemRequest) {
    const store = await this.requireStore(slug)
    const token = sessionToken?.trim() || crypto.randomUUID()

    const product = await this.productsRepo.findOne({
      where: {
        id: dto.productId,
        businessId: store.businessId,
        isPublishedOnline: true,
        isActive: true,
        deletedAt: IsNull(),
      },
    })
    if (!product) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.product_not_found'),
        'PRODUCT_NOT_FOUND',
      )
    }

    let unitPrice = product.sellingPrice
    let variantName: string | null = null
    if (dto.variantId) {
      const variant = await this.variantsRepo.findOne({
        where: { id: dto.variantId, productId: product.id, businessId: store.businessId },
      })
      if (!variant) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.variant_not_found'),
          'VARIANT_NOT_FOUND',
        )
      }
      unitPrice = variant.priceOverride ?? product.sellingPrice
      variantName = variant.name
    }

    const quantity = Math.max(1, Math.floor(dto.quantity))
    const cart =
      (await this.cartsRepo.findOne({ where: { onlineStoreId: store.id, sessionToken: token } })) ??
      this.cartsRepo.create({
        onlineStoreId: store.id,
        sessionToken: token,
        items: [],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

    const items = [...(cart.items ?? [])]
    const newItem: OnlineCartItem = {
      productId: product.id,
      variantId: dto.variantId ?? null,
      serialUnitId: dto.serialUnitId ?? null,
      quantity,
      unitPrice,
      productName: product.name,
      variantName,
    }
    const existing = items.find((item) => cartItemKey(item) === cartItemKey(newItem))
    if (existing) {
      existing.quantity += quantity
    } else {
      items.push(newItem)
    }
    cart.items = items
    const saved = await this.cartsRepo.save(cart)
    return this.toCartShape(saved, token)
  }

  async updateItem(slug: string, sessionToken: string, itemKey: string, quantity: number) {
    const cart = await this.requireCart(slug, sessionToken)
    const items = (cart.items ?? []).flatMap((item) => {
      if (cartItemKey(item) !== itemKey) return [item]
      if (quantity <= 0) return []
      return [{ ...item, quantity: Math.floor(quantity) }]
    })
    cart.items = items
    const saved = await this.cartsRepo.save(cart)
    return this.toCartShape(saved, sessionToken)
  }

  async removeItem(slug: string, sessionToken: string, itemKey: string) {
    const cart = await this.requireCart(slug, sessionToken)
    cart.items = (cart.items ?? []).filter((item) => cartItemKey(item) !== itemKey)
    const saved = await this.cartsRepo.save(cart)
    return this.toCartShape(saved, sessionToken)
  }

  // ---- Checkout -----------------------------------------------------------

  async checkout(slug: string, sessionToken: string, dto: CheckoutRequest) {
    try {
      const store = await this.requireStore(slug)
      const cart = await this.requireCart(slug, sessionToken)
      const items = cart.items ?? []
      if (items.length === 0) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.online_cart_empty'),
          'ONLINE_CART_EMPTY',
        )
      }

      const totalAmount = Math.round(
        items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      )
      if (store.minOrderAmount && totalAmount < store.minOrderAmount) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.online_min_order_not_met'),
          'ONLINE_MIN_ORDER_NOT_MET',
        )
      }

      const order = await this.ordersRepo.save(
        this.ordersRepo.create({
          onlineStoreId: store.id,
          businessId: store.businessId,
          saleId: null,
          orderNumber: this.buildOrderNumber(),
          trackingToken: crypto.randomUUID().replace(/-/g, ''),
          items,
          totalAmount,
          customerName: dto.customerName.trim(),
          customerEmail: dto.customerEmail?.trim() ?? null,
          customerPhone: dto.customerPhone.trim(),
          fulfillmentType: dto.fulfillmentType ?? 'DELIVERY',
          deliveryAddress: dto.deliveryAddress?.trim() ?? null,
          deliveryCity: dto.deliveryCity?.trim() ?? null,
          deliveryNotes: dto.deliveryNotes?.trim() ?? null,
          status: 'PENDING',
          paymentMethod: dto.paymentMethod ?? null,
          paymentStatus: 'PENDING',
        }),
      )

      await this.eventsRepo.save(
        this.eventsRepo.create({
          onlineOrderId: order.id,
          businessId: store.businessId,
          eventType: 'ORDER_PLACED',
          toStatus: 'PENDING',
          triggeredBy: 'CUSTOMER',
          isCustomerVisible: true,
          customerMessage: STATUS_EVENT.PENDING.message,
          trackingToken: order.trackingToken,
        }),
      )

      // Cart consumed.
      await this.cartsRepo.delete({ id: cart.id })

      return { orderNumber: order.orderNumber, trackingToken: order.trackingToken, status: order.status }
    } catch (error) {
      return this.handleServiceError('checkout', error, { slug })
    }
  }

  async getTracking(slug: string, trackingToken: string): Promise<PublicOrderTracking> {
    const store = await this.requireStore(slug)
    const order = await this.ordersRepo.findOne({
      where: { onlineStoreId: store.id, trackingToken },
    })
    if (!order) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.online_order_not_found'),
        'ONLINE_ORDER_NOT_FOUND',
      )
    }
    const events = await this.eventsRepo.find({
      where: { onlineOrderId: order.id, isCustomerVisible: true },
      order: { createdAt: 'ASC' },
    })
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: order.customerName,
      totalAmount: order.totalAmount,
      currency: store.currency,
      fulfillmentType: order.fulfillmentType,
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        isCustomerVisible: event.isCustomerVisible,
        customerMessage: event.customerMessage ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
    }
  }

  // ---- Owner order management --------------------------------------------

  async listOrders(
    businessId: string,
    options: { status?: OnlineOrderStatus; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(options.page ?? 1, 1)
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
    const where = options.status ? { businessId, status: options.status } : { businessId }
    const [data, total] = await this.ordersRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    })
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getOrder(businessId: string, id: string) {
    const order = await this.ordersRepo.findOne({ where: { id, businessId } })
    if (!order) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.online_order_not_found'),
        'ONLINE_ORDER_NOT_FOUND',
      )
    }
    const events = await this.eventsRepo.find({
      where: { onlineOrderId: id },
      order: { createdAt: 'ASC' },
    })
    return { ...order, events }
  }

  async updateStatus(
    businessId: string,
    id: string,
    dto: UpdateOrderStatusRequest,
    actor: { id: string | null; name: string | null },
  ) {
    try {
      const order = await this.ordersRepo.findOne({ where: { id, businessId } })
      if (!order) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.online_order_not_found'),
          'ONLINE_ORDER_NOT_FOUND',
        )
      }
      const fromStatus = order.status
      const toStatus = dto.status
      const now = new Date()
      const patch: Partial<OnlineOrder> = { status: toStatus }
      if (toStatus === 'CONFIRMED') patch.confirmedAt = now
      if (toStatus === 'DISPATCHED') patch.dispatchedAt = now

      // Deferred-sale policy: the financial sale is created only when the order is
      // both paid AND delivered. COD cash is collected at delivery, so DELIVERED
      // marks the order PAID and records the sale (deducting inventory) once.
      if (toStatus === 'DELIVERED') {
        patch.deliveredAt = now
        if (!order.saleId) {
          const sale = await this.createSaleForOrder(order, actor.id)
          patch.saleId = sale.id
          patch.paymentStatus = 'PAID'
          await this.eventsRepo.save(
            this.eventsRepo.create({
              onlineOrderId: id,
              businessId,
              eventType: 'PAYMENT_RECEIVED',
              triggeredBy: 'MERCHANT',
              actorId: actor.id,
              actorName: actor.name,
              isCustomerVisible: false,
              internalNote: `Sale ${sale.saleNumber} recorded on delivery.`,
              trackingToken: order.trackingToken,
            }),
          )
        }
      }
      await this.ordersRepo.update(id, patch)

      const mapping = STATUS_EVENT[toStatus]
      await this.eventsRepo.save(
        this.eventsRepo.create({
          onlineOrderId: id,
          businessId,
          eventType: mapping.type,
          fromStatus,
          toStatus,
          triggeredBy: 'MERCHANT',
          actorId: actor.id,
          actorName: actor.name,
          isCustomerVisible: true,
          customerMessage: dto.customerMessage?.trim() || mapping.message,
          internalNote: dto.internalNote?.trim() ?? null,
          trackingToken: order.trackingToken,
        }),
      )

      return this.getOrder(businessId, id)
    } catch (error) {
      return this.handleServiceError('updateStatus', error, { businessId, id })
    }
  }

  /**
   * Create the financial sale for a delivered+paid online order (deferred-sale
   * policy). The delivering merchant is the cashier; payment is the full total.
   * createFromSync is idempotent by clientId (= order id), so retries are safe.
   */
  private async createSaleForOrder(order: OnlineOrder, actorId: string | null) {
    const payload: SaleSyncPayload = {
      saleId: crypto.randomUUID(),
      clientId: order.id,
      saleNumber: order.orderNumber,
      soldAt: new Date().toISOString(),
      cashierId: actorId,
      customerName: order.customerName,
      customerPhone: order.customerPhone ?? undefined,
      notes: `Online order ${order.orderNumber}`,
      payments: [
        {
          id: crypto.randomUUID(),
          method: this.mapPaymentMethod(order.paymentMethod),
          amount: order.totalAmount,
        },
      ],
      items: (order.items ?? []).map((item) => ({
        id: crypto.randomUUID(),
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        variantName: item.variantName ?? undefined,
        serialUnitId: item.serialUnitId ?? undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    }
    return this.salesService.createFromSync(order.businessId, payload)
  }

  private mapPaymentMethod(method?: string | null): PaymentMethod {
    switch ((method ?? '').toUpperCase()) {
      case 'MTN_MOMO':
      case 'MTN':
        return PaymentMethod.MTN_MOMO
      case 'ORANGE_MONEY':
      case 'ORANGE':
        return PaymentMethod.ORANGE_MONEY
      case 'CARD':
        return PaymentMethod.CARD
      default:
        return PaymentMethod.CASH
    }
  }

  // ---- internals ----------------------------------------------------------

  private async requireStore(slug: string): Promise<OnlineStore> {
    const store = await this.storesRepo.findOne({
      where: { storeSlug: slug, isActive: true, deletedAt: IsNull() },
    })
    if (!store) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.online_store_not_found'),
        'ONLINE_STORE_NOT_FOUND',
      )
    }
    return store
  }

  private async requireCart(slug: string, sessionToken: string): Promise<OnlineCart> {
    const store = await this.requireStore(slug)
    const cart = await this.cartsRepo.findOne({ where: { onlineStoreId: store.id, sessionToken } })
    if (!cart) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.online_cart_not_found'),
        'ONLINE_CART_NOT_FOUND',
      )
    }
    return cart
  }

  private toCartShape(cart: OnlineCart | null, sessionToken: string): OnlineCartShape {
    const items = cart?.items ?? []
    return {
      sessionToken,
      items,
      subtotal: Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)),
      customerName: cart?.customerName ?? null,
      customerPhone: cart?.customerPhone ?? null,
      customerEmail: cart?.customerEmail ?? null,
      notes: cart?.notes ?? null,
    }
  }

  private buildOrderNumber(): string {
    const now = new Date()
    const date = now.toISOString().slice(0, 10).replace(/-/g, '')
    const rand = Math.floor(1000 + Math.random() * 9000)
    return `ORD-${date}-${rand}`
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('OnlineOrdersService error', 'OnlineOrdersService', {
        action,
        code: error.code,
        ...(metadata ?? {}),
      })
      throw error
    }
    this.logger.error('OnlineOrdersService unexpected error', 'OnlineOrdersService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })
    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'ONLINE_ORDERS_SERVICE_ERROR',
      { action },
    )
  }
}
