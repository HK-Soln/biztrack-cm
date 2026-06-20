import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm'
import { PurchaseOrderStatus } from '@biztrack/types'
import { dateTransformer } from '@/common/entities/transformers'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { PurchaseOrderItem } from './purchase-order-item.entity'

@Entity('purchase_orders')
@Index('idx_purchase_orders_business_id_deleted_at', ['businessId', 'deletedAt'])
@Index('idx_purchase_orders_business_id_status', ['businessId', 'status'])
export class PurchaseOrder extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_purchase_orders_business_id' })
  business?: Business

  @Column()
  number!: string

  @Column({ name: 'rfq_id', nullable: true, type: 'uuid' })
  rfqId?: string | null

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string

  @Column({ name: 'supplier_name', nullable: true, type: 'varchar' })
  supplierName?: string | null

  @Column({ nullable: true, type: 'varchar' })
  title?: string | null

  @Column({ name: 'message_body', nullable: true, type: 'text' })
  messageBody?: string | null

  @Column({ type: 'varchar', default: PurchaseOrderStatus.DRAFT })
  status!: PurchaseOrderStatus

  @Column({ type: 'varchar', default: 'XAF' })
  currency!: string

  @Column({ name: 'expected_date', nullable: true, type: 'timestamptz', transformer: dateTransformer })
  expectedDate?: Date | null

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalAmount!: number

  @Column({ name: 'sent_at', nullable: true, type: 'timestamptz', transformer: dateTransformer })
  sentAt?: Date | null

  @Column({ name: 'created_by_id', nullable: true, type: 'uuid' })
  createdById?: string | null

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder)
  items?: PurchaseOrderItem[]
}
