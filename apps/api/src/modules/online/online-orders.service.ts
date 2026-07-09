import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import {
  PaymentMethod,
  ONLINE_ORDER_COMPLETION_STATUSES,
  SerialUnitStatus,
  canTransitionOnlineOrder,
  type AddCartItemRequest,
  type CheckoutRequest,
  type OnlineCart as OnlineCartShape,
  type OnlineCartItem,
  type OnlineOrderStatus,
  type OnlinePaymentStatus,
  type OnlineStorePublishedConfig,
  type OrderSerialSelection,
  type PublicOrderTracking,
  type SaleSyncPayload,
  type UpdateOrderPaymentRequest,
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
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { SalesService } from '@/modules/sales/services/sales.service'
import { OnlineStoreService } from './online-store.service'

const cartItemKey = (item: {
  productId: string
  variantId?: string | null
  serialUnitId?: string | null
}) => `${item.productId}:${item.variantId ?? ''}:${item.serialUnitId ?? ''}`

const STATUS_EVENT: Record<
  OnlineOrderStatus,
  { type: OnlineOrderEvent['eventType']; message: string }
> = {
  PENDING: { type: 'ORDER_PLACED', message: 'Your order has been placed.' },
  CONFIRMED: { type: 'ORDER_CONFIRMED', message: 'Your order has been confirmed.' },
  PREPARING: { type: 'PREPARATION_STARTED', message: 'Your order is being prepared.' },
  READY_FOR_PICKUP: { type: 'ORDER_READY_FOR_PICKUP', message: 'Your order is ready for pickup.' },
  PICKED_UP: { type: 'ORDER_PICKED_UP', message: 'Your order has been picked up.' },
  READY_FOR_DISPATCH: { type: 'ORDER_PACKED', message: 'Your order is packed and ready to ship.' },
  OUT_FOR_DELIVERY: { type: 'ORDER_OUT_FOR_DELIVERY', message: 'Your order is out for delivery.' },
  DELIVERED: { type: 'ORDER_DELIVERED', message: 'Your order has been delivered.' },
  DELIVERY_FAILED: { type: 'DELIVERY_FAILED', message: 'A delivery attempt was unsuccessful.' },
  RETURNED: { type: 'ORDER_RETURNED', message: 'Your order has been returned.' },
  CANCELLED: { type: 'ORDER_CANCELLED', message: 'Your order has been cancelled.' },
}

const PAYMENT_EVENT: Record<
  OnlinePaymentStatus,
  { type: OnlineOrderEvent['eventType']; message: string }
> = {
  PENDING: { type: 'PAYMENT_INITIATED', message: 'Awaiting payment.' },
  AUTHORIZED: { type: 'PAYMENT_AUTHORIZED', message: 'Payment authorised.' },
  PAID: { type: 'PAYMENT_RECEIVED', message: 'Payment received.' },
  FAILED: { type: 'PAYMENT_FAILED', message: 'Payment failed.' },
  REFUNDED: { type: 'PAYMENT_REFUNDED', message: 'Your order has been refunded.' },
  PARTIALLY_REFUNDED: {
    type: 'PAYMENT_PARTIALLY_REFUNDED',
    message: 'Your order has been partially refunded.',
  },
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
    @InjectRepository(ProductSerialUnit)
    private readonly serialUnitsRepo: Repository<ProductSerialUnit>,
    private readonly salesService: SalesService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly storeService: OnlineStoreService,
  ) {
    this.logger.setContext('OnlineOrdersService')
  }

  // ---- Cart ---------------------------------------------------------------

  async getCart(slug: string, sessionToken: string): Promise<OnlineCartShape> {
    const { store } = await this.requireStore(slug)
    const cart = await this.cartsRepo.findOne({
      where: { onlineStoreId: store.id, sessionToken },
    })
    return this.toCartShape(cart, sessionToken)
  }

  async addItem(slug: string, sessionToken: string | undefined, dto: AddCartItemRequest) {
    const { store } = await this.requireStore(slug)
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
      const { store, config } = await this.requireStore(slug)
      const cart = await this.requireCart(slug, sessionToken)
      const items = cart.items ?? []
      if (items.length === 0) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.online_cart_empty'),
          'ONLINE_CART_EMPTY',
        )
      }

      // Min-order gates the GOODS value (subtotal), not delivery.
      const subtotal = Math.round(
        items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      )
      if (config.minOrderAmount && subtotal < config.minOrderAmount) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.online_min_order_not_met'),
          'ONLINE_MIN_ORDER_NOT_MET',
        )
      }

      // Delivery orders carry the store's flat delivery fee; pickup is free.
      const fulfillmentType = dto.fulfillmentType ?? 'DELIVERY'
      const deliveryFee =
        fulfillmentType === 'DELIVERY' && config.fulfilment.offerDelivery
          ? Math.max(0, Math.round(config.fulfilment.deliveryFee ?? 0))
          : 0
      const totalAmount = subtotal + deliveryFee

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
          fulfillmentType,
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

      return {
        orderNumber: order.orderNumber,
        trackingToken: order.trackingToken,
        status: order.status,
      }
    } catch (error) {
      return this.handleServiceError('checkout', error, { slug })
    }
  }

  async getTracking(slug: string, trackingToken: string): Promise<PublicOrderTracking> {
    const { store, config } = await this.requireStore(slug)
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
      currency: config.currency,
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

      // Enforce the fulfilment state machine for THIS order's fulfilment type (shared with
      // the admin UI). Rejects illegal jumps, backward moves, wrong-branch and no-op updates.
      if (!canTransitionOnlineOrder(order.fulfillmentType, fromStatus, toStatus)) {
        throw new AppBadRequestException(
          `Cannot change a ${order.fulfillmentType.toLowerCase()} order from ${fromStatus} to ${toStatus}.`,
          'ONLINE_ORDER_INVALID_TRANSITION',
        )
      }

      const now = new Date()
      const patch: Partial<OnlineOrder> = { status: toStatus }
      if (toStatus === 'CONFIRMED') patch.confirmedAt = now
      if (toStatus === 'READY_FOR_PICKUP' || toStatus === 'READY_FOR_DISPATCH') patch.readyAt = now
      if (toStatus === 'OUT_FOR_DELIVERY') patch.outForDeliveryAt = now
      if (toStatus === 'DELIVERED') patch.deliveredAt = now
      if (toStatus === 'PICKED_UP') patch.pickedUpAt = now
      if (toStatus === 'RETURNED') patch.returnedAt = now

      // Serial-unit assignment: the admin chooses serials for serialized items (typically at
      // CONFIRMED). We reserve them now; the deferred sale marks them SOLD on completion.
      if (toStatus === 'CONFIRMED' || ONLINE_ORDER_COMPLETION_STATUSES.includes(toStatus)) {
        const reservedItems = await this.assignSerialUnits(
          order,
          dto.serialUnitSelections,
          actor.id,
        )
        if (reservedItems) {
          order.items = reservedItems
          patch.items = reservedItems
        }
      }
      // Cancelling before completion frees any serials reserved at confirmation.
      if (toStatus === 'CANCELLED') {
        await this.releaseReservedSerials(order)
      }

      // Deferred-sale policy: the financial sale is created once the order is COMPLETED
      // (DELIVERED for delivery, PICKED_UP for pickup) — inventory deducts then, idempotent
      // by order id. For COD (not yet paid), completion also collects payment → PAID.
      if (ONLINE_ORDER_COMPLETION_STATUSES.includes(toStatus) && !order.saleId) {
        const sale = await this.createSaleForOrder(order, actor.id)
        patch.saleId = sale.id
        if (order.paymentStatus !== 'PAID') {
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
              internalNote: `Sale ${sale.saleNumber} recorded on ${toStatus.toLowerCase()}.`,
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
   * Record how an online order was paid (payment axis — independent of fulfilment). The
   * admin marks the order paid at any time once it's confirmed and picks the static method
   * the customer used; that method flows to the deferred sale created on completion. Dynamic
   * per-business methods arrive with PayTrack.
   */
  async updatePayment(
    businessId: string,
    id: string,
    dto: UpdateOrderPaymentRequest,
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
      // Payment can only be recorded once the order is real (confirmed) and not cancelled.
      if (order.status === 'PENDING' || order.status === 'CANCELLED') {
        throw new AppBadRequestException(
          `Cannot record payment for a ${order.status.toLowerCase()} order.`,
          'ONLINE_ORDER_PAYMENT_NOT_ALLOWED',
        )
      }

      const patch: Partial<OnlineOrder> = { paymentStatus: dto.paymentStatus }
      if (dto.paymentMethod !== undefined) patch.paymentMethod = dto.paymentMethod ?? null
      await this.ordersRepo.update(id, patch)

      const mapping = PAYMENT_EVENT[dto.paymentStatus]
      await this.eventsRepo.save(
        this.eventsRepo.create({
          onlineOrderId: id,
          businessId,
          eventType: mapping.type,
          triggeredBy: 'MERCHANT',
          actorId: actor.id,
          actorName: actor.name,
          isCustomerVisible: dto.paymentStatus === 'PAID' || dto.paymentStatus.includes('REFUNDED'),
          customerMessage: mapping.message,
          internalNote: dto.paymentMethod ? `Method: ${dto.paymentMethod}` : null,
          trackingToken: order.trackingToken,
        }),
      )

      return this.getOrder(businessId, id)
    } catch (error) {
      return this.handleServiceError('updatePayment', error, { businessId, id })
    }
  }

  /**
   * Create the financial sale for a delivered+paid online order (deferred-sale
   * policy). The delivering merchant is the cashier; payment is the full total.
   * createFromSync is idempotent by clientId (= order id), so retries are safe.
   */
  /**
   * Assign + reserve the serial units an admin chose for serialized items. Splits a
   * serialized item of quantity N into N lines (one serial each) so the deferred sale can
   * consume them. Returns the rewritten item list, or null when nothing serialized needs it.
   * Throws if serials are missing/insufficient/unavailable.
   */
  private async assignSerialUnits(
    order: OnlineOrder,
    selections: OrderSerialSelection[] | undefined,
    actorId: string | null,
  ): Promise<OnlineCartItem[] | null> {
    const items = order.items ?? []
    const productIds = [...new Set(items.map((i) => i.productId))]
    if (productIds.length === 0) return null
    const products = await this.productsRepo.find({
      where: { id: In(productIds), businessId: order.businessId },
    })
    const serializedIds = new Set(products.filter((p) => p.isSerialized).map((p) => p.id))

    // Only items that are serialized AND not already assigned need a choice.
    const pending = items.filter((i) => serializedIds.has(i.productId) && !i.serialUnitId)
    if (pending.length === 0) return null

    const selByKey = new Map<string, OrderSerialSelection>()
    for (const sel of selections ?? []) {
      selByKey.set(`${sel.productId}:${sel.variantId ?? ''}`, sel)
    }

    // Resolve the chosen ids per pending item and validate counts.
    const chosen: Array<{ item: OnlineCartItem; ids: string[] }> = []
    for (const item of pending) {
      const sel = selByKey.get(`${item.productId}:${item.variantId ?? ''}`)
      const ids = sel?.serialUnitIds ?? []
      if (ids.length !== item.quantity) {
        throw new AppBadRequestException(
          `Select ${item.quantity} unit(s) for "${item.productName}".`,
          'SERIAL_UNIT_REQUIRED',
        )
      }
      chosen.push({ item, ids })
    }

    const allIds = chosen.flatMap((c) => c.ids)
    if (new Set(allIds).size !== allIds.length) {
      throw new AppBadRequestException(
        'A serial unit was selected more than once.',
        'SERIAL_UNIT_DUPLICATE',
      )
    }

    const units = await this.serialUnitsRepo.find({
      where: { id: In(allIds), businessId: order.businessId, deletedAt: IsNull() },
    })
    const unitById = new Map(units.map((u) => [u.id, u]))
    for (const { item, ids } of chosen) {
      for (const id of ids) {
        const unit = unitById.get(id)
        if (!unit || unit.status !== SerialUnitStatus.IN_STOCK) {
          throw new AppBadRequestException(
            `A selected unit for "${item.productName}" is no longer available.`,
            'SERIAL_UNIT_UNAVAILABLE',
          )
        }
        if (
          unit.productId !== item.productId ||
          (unit.variantId ?? null) !== (item.variantId ?? null)
        ) {
          throw new AppBadRequestException(
            `A selected unit does not match "${item.productName}".`,
            'SERIAL_UNIT_MISMATCH',
          )
        }
      }
    }

    // Reserve the units (freed again on cancel; the sale flips them to SOLD on completion).
    await this.serialUnitsRepo.update(
      { id: In(allIds) },
      { status: SerialUnitStatus.RESERVED, reservedAt: new Date(), reservedBy: actorId },
    )

    // Rewrite items: expand each serialized item into one line per chosen serial.
    const pendingSet = new Set(pending)
    const chosenByItem = new Map(chosen.map((c) => [c.item, c.ids]))
    const rewritten: OnlineCartItem[] = []
    for (const item of items) {
      if (pendingSet.has(item)) {
        for (const serialUnitId of chosenByItem.get(item) ?? []) {
          rewritten.push({ ...item, quantity: 1, serialUnitId })
        }
      } else {
        rewritten.push(item)
      }
    }
    return rewritten
  }

  /** Release serials reserved for an order (on cancellation) back to IN_STOCK. */
  private async releaseReservedSerials(order: OnlineOrder): Promise<void> {
    const ids = (order.items ?? [])
      .map((i) => i.serialUnitId)
      .filter((id): id is string => Boolean(id))
    if (ids.length === 0) return
    await this.serialUnitsRepo.update(
      { id: In(ids), businessId: order.businessId, status: SerialUnitStatus.RESERVED },
      { status: SerialUnitStatus.IN_STOCK, reservedAt: null, reservedBy: null },
    )
  }

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

  /** Customers only ever interact with the PUBLISHED store (its snapshot config) — a draft /
   *  suspended / never-published store 404s, so carts and checkout can't run against a draft. */
  private async requireStore(
    slug: string,
  ): Promise<{ store: OnlineStore; config: OnlineStorePublishedConfig }> {
    const published = await this.storeService.getPublishedStore(slug)
    if (!published) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.online_store_not_found'),
        'ONLINE_STORE_NOT_FOUND',
      )
    }
    return published
  }

  private async requireCart(slug: string, sessionToken: string): Promise<OnlineCart> {
    const { store } = await this.requireStore(slug)
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
