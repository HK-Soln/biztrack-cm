import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { ProductCategory } from './product-category.entity'
import { SaleItem } from './sale-item.entity'
import { StockMovement } from './stock-movement.entity'

@Entity('products')
@Unique('unq_products_business_id_barcode', ['businessId', 'barcode'])
@Unique('unq_products_business_id_sku', ['businessId', 'sku'])
@Index('idx_products_business_id_deleted_at', ['businessId', 'deletedAt'])
export class Product extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_products_business_id' })
  business?: Business

  @Column()
  name!: string

  @Column({ nullable: true })
  description!: string 

  @Column({ nullable: true })
  sku!: string 

  @Column({ nullable: true })
  barcode!: string 

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  price!: number

  @Column({
    name: 'cost_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  costPrice!: number 

  @Column({ name: 'stock_quantity', default: 0 })
  stockQuantity!: number

  @Column({ name: 'low_stock_threshold', default: 5 })
  lowStockThreshold!: number

  @Column({ default: 'piece' })
  unit!: string

  @Column({ name: 'category_id', nullable: true })
  categoryId!: string 

  @ManyToOne(() => ProductCategory, (category) => category.products, { nullable: true })
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_products_category_id' })
  category!: ProductCategory 

  @Column({ name: 'image_url', nullable: true })
  imageUrl?: string 

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @OneToMany(() => SaleItem, (item) => item.product)
  saleItems?: SaleItem[]

  @OneToMany(() => StockMovement, (movement) => movement.product)
  stockMovements?: StockMovement[]
}
