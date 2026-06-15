import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Brand } from './brand.entity'
import { ProductCategory } from './product-category.entity'

/** Many-to-many link of a brand to a category. */
@Entity('brand_categories')
@Unique('unq_brand_category', ['brandId', 'categoryId'])
@Index('idx_brand_categories_business_id', ['businessId'])
export class BrandCategory extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @Column({ name: 'brand_id' })
  brandId!: string

  @ManyToOne(() => Brand, (brand) => brand.categoryLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id', foreignKeyConstraintName: 'fk_brand_categories_brand_id' })
  brand?: Brand

  @Column({ name: 'category_id' })
  categoryId!: string

  @ManyToOne(() => ProductCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_brand_categories_category_id' })
  category?: ProductCategory
}
