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
import { SaleReturn } from './sale-return.entity'

/** A single returned line within a {@link SaleReturn}. */
@Entity('sale_return_items')
@Index('idx_sale_return_items_return_id', ['saleReturnId'])
@Index('idx_sale_return_items_business_id', ['businessId'])
export class SaleReturnItem extends TypeOrmBaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ name: 'sale_return_id', type: 'uuid' })
  saleReturnId!: string

  @ManyToOne(() => SaleReturn, (saleReturn) => saleReturn.items, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'sale_return_id',
    foreignKeyConstraintName: 'fk_sale_return_items_return_id',
  })
  saleReturn?: SaleReturn

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'sale_item_id', type: 'uuid' })
  saleItemId!: string

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  quantity!: number

  @Column({ name: 'serial_unit_id', type: 'uuid', nullable: true })
  serialUnitId?: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
