import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import type {
  OnlineCartItem,
  OnlineFulfillmentType,
  OnlineOrderStatus,
  OnlinePaymentStatus,
} from '@biztrack/types'

/** An order placed through the storefront (Phase 3I). */
@Entity('online_orders')
@Index('idx_online_orders_business', ['businessId', 'createdAt'])
@Index('idx_online_orders_tracking', ['trackingToken'])
export class OnlineOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'online_store_id' })
  onlineStoreId!: string

  @Column({ name: 'business_id' })
  businessId!: string

  // Set when the merchant confirms and the financial sale is created (part 3).
  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId?: string | null

  @Column({ name: 'order_number', length: 30, unique: true })
  orderNumber!: string

  @Column({ name: 'tracking_token', length: 64 })
  trackingToken!: string

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items!: OnlineCartItem[]

  @Column({ name: 'total_amount', type: 'int', default: 0 })
  totalAmount!: number

  @Column({ name: 'customer_name', length: 200 })
  customerName!: string

  @Column({ name: 'customer_email', length: 300, nullable: true, type: 'varchar' })
  customerEmail?: string | null

  @Column({ name: 'customer_phone', length: 30, nullable: true, type: 'varchar' })
  customerPhone?: string | null

  @Column({ name: 'fulfillment_type', length: 20, default: 'DELIVERY' })
  fulfillmentType!: OnlineFulfillmentType

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress?: string | null

  @Column({ name: 'delivery_city', length: 100, nullable: true, type: 'varchar' })
  deliveryCity?: string | null

  @Column({ name: 'delivery_notes', type: 'text', nullable: true })
  deliveryNotes?: string | null

  @Column({ length: 20, default: 'PENDING' })
  status!: OnlineOrderStatus

  @Column({ name: 'payment_method', length: 40, nullable: true, type: 'varchar' })
  paymentMethod?: string | null

  @Column({ name: 'payment_status', length: 20, default: 'PENDING' })
  paymentStatus!: OnlinePaymentStatus

  @Column({ name: 'payment_reference', length: 200, nullable: true, type: 'varchar' })
  paymentReference?: string | null

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt?: Date | null

  @Column({ name: 'dispatched_at', type: 'timestamp', nullable: true })
  dispatchedAt?: Date | null

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt?: Date | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
