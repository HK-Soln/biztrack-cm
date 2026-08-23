import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'

/**
 * Per-product low-stock alert suppression (BIZ-4.5). Records the last time a product
 * was included in a dispatched reorder notification, so the daily scan doesn't re-notify
 * about the same product within the suppression window. One row per (business, product).
 */
@Entity('reorder_alert_log')
@Index('unq_reorder_alert_log_business_product', ['businessId', 'productId'], { unique: true })
export class ReorderAlertLog extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Column({ name: 'alerted_at', type: 'timestamptz', transformer: dateTransformer })
  alertedAt!: Date
}
