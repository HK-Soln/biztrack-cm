import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Rfq } from './rfq.entity'

@Entity('rfq_items')
@Index('idx_rfq_items_rfq_id', ['rfqId'])
export class RfqItem extends BaseEntity {
  @Column({ name: 'rfq_id' })
  rfqId!: string

  @ManyToOne(() => Rfq, (rfq) => rfq.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rfq_id', foreignKeyConstraintName: 'fk_rfq_items_rfq_id' })
  rfq?: Rfq

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Column({ name: 'variant_id', nullable: true, type: 'uuid' })
  variantId?: string | null

  @Column()
  description!: string

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  quantity!: number
}
