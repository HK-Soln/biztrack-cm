import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { Product } from './product.entity'

@Entity('product_categories')
@Index('idx_product_categories_business_id_deleted_at', ['businessId', 'deletedAt'])
export class ProductCategory extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.productCategories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_product_categories_business_id' })
  business?: Business

  @Column()
  name!: string

  @OneToMany(() => Product, (product) => product.category)
  products!: Product[]
}
