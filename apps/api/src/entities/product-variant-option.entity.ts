import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { ProductVariant } from './product-variant.entity'
import { AttributeGroup } from './attribute-group.entity'
import { AttributeOption } from './attribute-option.entity'

/**
 * Normalized link between a variant and one attribute option value.
 * A variant has exactly one option per attribute group.
 */
@Entity('product_variant_options')
@Unique('uq_variant_option_per_group', ['variantId', 'attributeGroupId'])
@Index('idx_variant_options_variant', ['variantId'])
@Index('idx_variant_options_option', ['attributeOptionId'])
export class ProductVariantOption extends BaseEntity {
  @Column({ name: 'variant_id' })
  variantId!: string

  @ManyToOne(() => ProductVariant, (variant) => variant.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id', foreignKeyConstraintName: 'fk_variant_options_variant_id' })
  variant?: ProductVariant

  @Column({ name: 'attribute_group_id' })
  attributeGroupId!: string

  @ManyToOne(() => AttributeGroup, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'attribute_group_id', foreignKeyConstraintName: 'fk_variant_options_group_id' })
  group?: AttributeGroup

  @Column({ name: 'attribute_option_id' })
  attributeOptionId!: string

  @ManyToOne(() => AttributeOption, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'attribute_option_id', foreignKeyConstraintName: 'fk_variant_options_option_id' })
  option?: AttributeOption

  @Column({ name: 'business_id' })
  businessId!: string
}
