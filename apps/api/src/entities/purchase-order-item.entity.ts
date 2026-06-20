import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { PurchaseOrder } from './purchase-order.entity'

@Entity('purchase_order_items')
@Index('idx_po_items_purchase_order_id', ['purchaseOrderId'])
export class PurchaseOrderItem extends BaseEntity {
  @Column({ name: 'purchase_order_id' })
  purchaseOrderId!: string

  @ManyToOne(() => PurchaseOrder, (po) => po.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id', foreignKeyConstraintName: 'fk_po_items_purchase_order_id' })
  purchaseOrder?: PurchaseOrder

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Column({ name: 'variant_id', nullable: true, type: 'uuid' })
  variantId?: string | null

  @Column()
  description!: string

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  quantity!: number

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  unitPrice!: number

  @Column({ name: 'received_quantity', type: 'numeric', precision: 14, scale: 2, default: 0 })
  receivedQuantity!: number
}
