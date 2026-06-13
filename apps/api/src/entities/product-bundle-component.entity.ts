import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Product } from './product.entity'

/**
 * A component line of a COMPOSITE (bundle) product (Phase 3F): selling one bundle
 * deducts `quantity` of each component product's stock.
 */
@Entity('product_bundle_components')
@Unique('uq_bundle_component', ['bundleProductId', 'componentProductId'])
@Index('idx_bundle_components_bundle', ['bundleProductId'])
@Index('idx_bundle_components_component', ['componentProductId'])
@Index('idx_bundle_components_business', ['businessId'])
export class ProductBundleComponent extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_bundle_components_business_id' })
  business?: Business

  @Column({ name: 'bundle_product_id' })
  bundleProductId!: string

  @ManyToOne(() => Product, (product) => product.bundleComponents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bundle_product_id', foreignKeyConstraintName: 'fk_bundle_components_bundle_id' })
  bundleProduct?: Product

  @Column({ name: 'component_product_id' })
  componentProductId!: string

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'component_product_id',
    foreignKeyConstraintName: 'fk_bundle_components_component_id',
  })
  componentProduct?: Product

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 1, transformer: decimalTransformer })
  quantity!: number

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number
}
