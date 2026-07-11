import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm'
import { decimalTransformer } from '@/common/entities/transformers'
import { Sale } from './sale.entity'
import { SaleReturnItem } from './sale-return-item.entity'

/**
 * A return/refund event against a sale. Written when an online order is returned (or an
 * in-store sale is refunded, later). Carries the refunded amount + restock intent; the
 * money movement itself is a signed REFUND row in sale_payments. Pull-only child of the
 * sale aggregate — see docs/online-order-sale-flow-redesign.md §3.5.
 */
@Entity('sale_returns')
@Index('idx_sale_returns_sale_id', ['saleId'])
@Index('idx_sale_returns_business_id', ['businessId'])
export class SaleReturn extends TypeOrmBaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId!: string

  @ManyToOne(() => Sale, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id', foreignKeyConstraintName: 'fk_sale_returns_sale_id' })
  sale?: Sale

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'online_order_id', type: 'uuid', nullable: true })
  onlineOrderId?: string | null

  @Column({ type: 'text', nullable: true })
  reason?: string | null

  @Column({ type: 'boolean', default: true })
  restock!: boolean

  @Column({
    name: 'refund_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  refundAmount!: number

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById?: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @OneToMany(() => SaleReturnItem, (item) => item.saleReturn)
  items?: SaleReturnItem[]
}
