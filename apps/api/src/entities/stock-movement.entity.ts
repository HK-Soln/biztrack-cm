import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Product } from './product.entity'
import { User } from './user.entity'

@Entity('stock_movements')
@Index('idx_stock_movements_business_id_product_id', ['businessId', 'productId'])
export class StockMovement extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.stockMovements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_stock_movements_business_id' })
  business?: Business

  @Column({ name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, (product) => product.stockMovements)
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_stock_movements_product_id' })
  product?: Product

  @Column()
  type!: string

  @Column({ type: 'decimal', precision: 10, scale: 3, transformer: decimalTransformer })
  quantity!: number

  @Column({
    name: 'previous_quantity',
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  previousQuantity!: number

  @Column({
    name: 'new_quantity',
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  newQuantity!: number

  @Column({ nullable: true })
  reason?: string 

  @Column({ name: 'reference_id', nullable: true })
  referenceId?: string 

  @Column({ name: 'recorded_by_id' })
  recordedById!: string

  @ManyToOne(() => User, (user) => user.stockMovements)
  @JoinColumn({ name: 'recorded_by_id', foreignKeyConstraintName: 'fk_stock_movements_recorded_by_id' })
  recordedBy?: User
}
