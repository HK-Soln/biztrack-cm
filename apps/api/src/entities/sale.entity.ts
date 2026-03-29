import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { User } from './user.entity'
import { SaleItem } from './sale-item.entity'

@Entity('sales')
@Index('idx_sales_business_id_deleted_at', ['businessId', 'deletedAt'])
@Index('idx_sales_business_id_created_at', ['businessId', 'createdAt'])
export class Sale extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.sales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_sales_business_id' })
  business?: Business

  @Column({ name: 'cashier_id' })
  cashierId!: string

  @ManyToOne(() => User, (user) => user.sales)
  @JoinColumn({ name: 'cashier_id', foreignKeyConstraintName: 'fk_sales_cashier_id' })
  cashier?: User

  @Column({ name: 'device_id', nullable: true })
  deviceId!: string 

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalAmount!: number

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  discountAmount!: number

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxAmount!: number

  @Column({
    name: 'net_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  netAmount!: number

  @Column({ name: 'payment_method' })
  paymentMethod!: string

  @Column({ name: 'momo_reference', nullable: true })
  momoReference!: string 

  @Column({ nullable: true })
  notes!: string 

  @Column({ name: 'receipt_number' })
  receiptNumber!: string

  @Column({ default: 'COMPLETED' })
  status!: string

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
  items?: SaleItem[]
}
