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
import { Business } from './business.entity'
import { Product } from './product.entity'

@Entity('product_categories')
@Unique('unq_product_categories_business_id_slug', ['businessId', 'slug'])
@Index('idx_product_categories_business_id_deleted_at', ['businessId', 'deletedAt'])
export class ProductCategory extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.productCategories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_product_categories_business_id' })
  business?: Business

  @Column()
  name!: string

  @Column()
  slug!: string

  @Column({ nullable: true, type: 'text' })
  description?: string | null

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ name: 'show_online', default: true })
  showOnline!: boolean

  @Column({ nullable: true, type: 'varchar', length: 7 })
  color?: string | null // Hex color code (e.g., #FF5733)

  @Column({ nullable: true, type: 'varchar', })
  icon?: string | null

  @Column({ name: 'image_url', nullable: true, type: 'varchar' })
  imageUrl?: string | null

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId?: string | null

  @ManyToOne(() => ProductCategory, (category) => category.children, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parent_id', foreignKeyConstraintName: 'fk_product_categories_parent_id' })
  parent?: ProductCategory | null

  @OneToMany(() => ProductCategory, (category) => category.parent)
  children?: ProductCategory[]

  // 1 = top-level (L1), max 3. Kept in sync with the parent chain in the service.
  @Column({ name: 'depth', type: 'smallint', default: 1 })
  depth!: number

  @OneToMany(() => Product, (product) => product.category)
  products!: Product[]

  // Transient (not persisted): populated by the service for responses.
  isLeaf?: boolean
}
