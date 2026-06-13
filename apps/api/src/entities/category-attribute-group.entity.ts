import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { ProductCategory } from './product-category.entity'
import { AttributeGroup } from './attribute-group.entity'

@Entity('category_attribute_groups')
@Unique('uq_category_attribute_group', ['categoryId', 'attributeGroupId'])
@Index('idx_cat_attr_groups_category', ['categoryId'])
export class CategoryAttributeGroup extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @Column({ name: 'category_id' })
  categoryId!: string

  @ManyToOne(() => ProductCategory, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'category_id',
    foreignKeyConstraintName: 'fk_category_attribute_groups_category_id',
  })
  category?: ProductCategory

  @Column({ name: 'attribute_group_id' })
  attributeGroupId!: string

  @ManyToOne(() => AttributeGroup, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'attribute_group_id',
    foreignKeyConstraintName: 'fk_category_attribute_groups_attribute_group_id',
  })
  attributeGroup?: AttributeGroup

  @Column({ name: 'is_required', default: true })
  isRequired!: boolean

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number
}
