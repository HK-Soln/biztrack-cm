import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Product } from './product.entity'
import { ProductVariant } from './product-variant.entity'

// Uniqueness is enforced by two partial unique indexes (see the variant
// migration): one for non-variant rows (business_id, product_id WHERE variant_id
// IS NULL) and one per-variant (business_id, product_id, variant_id).
@Entity('inventory_levels')
@Index('idx_inventory_levels_business_id', ['businessId'])
export class InventoryLevel extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_inventory_levels_business_id' })
  business?: Business

  @Column({ name: 'product_id' })
  productId!: string

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_inventory_levels_product_id' })
  product?: Product

  // Null for products without variants; set to the variant for per-variant stock.
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string | null

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'variant_id', foreignKeyConstraintName: 'fk_inventory_levels_variant_id' })
  variant?: ProductVariant | null

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  quantity!: number

  @Column({
    name: 'low_stock_threshold',
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  lowStockThreshold?: number | null

  @Column({
    name: 'reorder_point',
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  reorderPoint?: number | null

  @Column({
    name: 'quantity_reserved',
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  quantityReserved!: number

  @Column({ name: 'last_restock_at', type: 'timestamptz', nullable: true })
  lastRestockAt?: Date | null

  get quantityAvailable(): number {
    return Math.max(0, this.quantity - this.quantityReserved)
  }
}
