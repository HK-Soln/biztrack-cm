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

/** A supplier charge (tax/transport/packaging) applied when settling a goods receipt.
 * Mirrors SaleCharge; chargeTypeId is a soft reference (catalog values are denormalized). */
@Entity('restock_charges')
@Index('idx_restock_charges_record', ['restockRecordId'])
@Index('idx_restock_charges_business', ['businessId'])
export class RestockCharge extends TypeOrmBaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ name: 'restock_record_id', type: 'uuid' })
  restockRecordId!: string

  @ManyToOne(() => RestockRecord, (record) => record.charges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restock_record_id', foreignKeyConstraintName: 'fk_restock_charges_record' })
  restockRecord?: RestockRecord

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'charge_type_id', type: 'uuid', nullable: true })
  chargeTypeId?: string | null

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ name: 'rate_type', type: 'varchar', length: 20, default: 'FIXED' })
  rateType!: string

  @Column({
    name: 'rate_value',
    type: 'numeric',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  rateValue!: number

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
