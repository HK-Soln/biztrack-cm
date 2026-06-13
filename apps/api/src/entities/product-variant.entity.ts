import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index, Unique } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { Product } from './product.entity'
import { ProductVariantOption } from './product-variant-option.entity'

/**
 * A concrete sellable configuration of a product (e.g. "Black 128GB").
 *
 * price_override / cost_price_override are stored as integers (XAF is a
 * zero-decimal currency); null means "inherit from the parent product".
 */
@Entity('product_variants')
@Unique('uq_variant_name_per_product', ['productId', 'name'])
@Index('idx_product_variants_product_id', ['productId'])
@Index('idx_product_variants_business_id', ['businessId'])
export class ProductVariant extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_product_variants_business_id' })
  business?: Business

  @Column({ name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'fk_product_variants_product_id' })
  product?: Product

  // Auto-generated from option values, unless the owner overrides it.
  @Column()
  name!: string

  @Column({ name: 'display_name_override', type: 'varchar', length: 200, nullable: true })
  displayNameOverride?: string | null

  @Column({ name: 'price_override', type: 'int', nullable: true })
  priceOverride?: number | null

  @Column({ name: 'cost_price_override', type: 'int', nullable: true })
  costPriceOverride?: number | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  sku?: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode?: string | null

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @OneToMany(() => ProductVariantOption, (option) => option.variant)
  options?: ProductVariantOption[]
}
