import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { Repository } from 'typeorm'
import type { OnlineOrderStatus } from '@biztrack/types'
import { renderOrderStatusEmail } from '@biztrack/templates'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { AppConfig } from '@/config/configuration'
import { Business } from '@/entities/business.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { EmailProvider } from '@/modules/notifications/providers/email.provider'

/** Copy per fulfilment status. A `null` entry means "don't email the customer for this step". */
const STATUS_EMAIL: Record<
  OnlineOrderStatus,
  { subject: string; headline: string; message: string } | null
> = {
  PENDING: {
    subject: 'We received your order',
    headline: 'Order received',
    message: "Thanks for your order! We've received it and will confirm it shortly.",
  },
  // Placement already served as the confirmation email — don't double up on confirm.
  CONFIRMED: null,
  PREPARING: {
    subject: 'Your order is being prepared',
    headline: 'Preparing your order',
    message: "Good news — we're preparing your order now.",
  },
  READY_FOR_PICKUP: {
    subject: 'Your order is ready for pickup',
    headline: 'Ready for pickup',
    message: 'Your order is ready. Come pick it up at your convenience.',
  },
  READY_FOR_DISPATCH: {
    subject: 'Your order is packed',
    headline: 'Packed & ready',
    message: 'Your order is packed and ready to ship.',
  },
  OUT_FOR_DELIVERY: {
    subject: 'Your order is on the way',
    headline: 'Out for delivery',
    message: 'Your order is out for delivery and will reach you soon.',
  },
  DELIVERED: {
    subject: 'Your order has been delivered',
    headline: 'Delivered',
    message: 'Your order has been delivered. Thank you for shopping with us!',
  },
  PICKED_UP: {
    subject: 'Thanks for picking up your order',
    headline: 'Picked up',
    message: 'Thanks for collecting your order. We hope to see you again!',
  },
  DELIVERY_FAILED: {
    subject: 'Delivery attempt unsuccessful',
    headline: 'Delivery unsuccessful',
    message: "We couldn't complete delivery this time. We'll try again shortly.",
  },
  RETURNED: {
    subject: 'Your order has been returned',
    headline: 'Order returned',
    message: 'Your order has been returned and any refund has been processed.',
  },
  CANCELLED: {
    subject: 'Your order has been cancelled',
    headline: 'Order cancelled',
    message: 'Your order has been cancelled. Please contact us if you have any questions.',
  },
}

/**
 * Sends the customer a branded, business-identity email on each order step. Best-effort — a
 * failure never blocks the order operation. Templates live in @biztrack/templates.
 */
@Injectable()
export class OrderEmailService {
  constructor(
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    private readonly email: EmailProvider,
    private readonly config: ConfigService<AppConfig>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('OrderEmailService')
  }

  async sendStatusEmail(order: OnlineOrder, status: OnlineOrderStatus): Promise<void> {
    try {
      const to = order.customerEmail?.trim()
      if (!to) return
      const copy = STATUS_EMAIL[status]
      if (!copy) return

      const business = await this.businessesRepo.findOne({ where: { id: order.businessId } })
      if (!business) return

      const webUrl = this.config.get('BIZTRACK_WEB_URL', { infer: true })!
      const { subject, html } = renderOrderStatusEmail(`${copy.subject} · ${order.orderNumber}`, {
        business: {
          name: business.name,
          email: business.email,
          phone: business.phone,
          address: business.address,
          logoUrl: business.logoUrl,
        },
        order: {
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          total: this.formatTotal(order.totalAmount, business.currency),
        },
        headline: copy.headline,
        message: copy.message,
        poweredByUrl: webUrl,
      })

      await this.email.sendRaw({
        from: this.email.noReplySender,
        to,
        subject,
        html,
        ...(business.email ? { reply_to: business.email } : {}),
      })
    } catch (err) {
      // Email is best-effort — log and move on so it never blocks the order operation.
      this.logger.warn(
        `Order email failed for ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
        'OrderEmailService',
      )
    }
  }

  private formatTotal(total: number | null | undefined, currency: string): string | null {
    if (!total) return null
    return `${new Intl.NumberFormat('fr-FR').format(total)} ${currency}`
  }
}
