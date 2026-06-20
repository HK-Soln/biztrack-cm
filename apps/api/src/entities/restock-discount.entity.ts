import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm'
import { decimalTransformer } from '@/common/entities/transformers'
import { RestockRecord } from './restock-record.entity'

/** A supplier discount (remise) applied when settling a goods receipt. Mirrors SaleDiscount. */
@Entity('restock_discounts')
@Index('idx_restock_discounts_record', ['restockRecordId'])
@Index('idx_restock_discounts_business', ['businessId'])
export class RestockDiscount extends TypeOrmBaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ name: 'restock_record_id', type: 'uuid' })
  restockRecordId!: string

  @ManyToOne(() => RestockRecord, (record) => record.discounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restock_record_id', foreignKeyConstraintName: 'fk_restock_discounts_record' })
  restockRecord?: RestockRecord

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ type: 'varchar', length: 200, default: '' })
  description!: string

  @Column({ name: 'discount_type', type: 'varchar', length: 20, default: 'FIXED_AMOUNT' })
  discountType!: string

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  rate?: number | null

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amount!: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
