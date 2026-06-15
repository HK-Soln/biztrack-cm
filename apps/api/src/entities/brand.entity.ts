import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index, Unique } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { Model } from './model.entity'
import { BrandCategory } from './brand-category.entity'

@Entity('brands')
@Unique('unq_brands_business_id_slug', ['businessId', 'slug'])
@Index('idx_brands_business_id_deleted_at', ['businessId', 'deletedAt'])
export class Brand extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_brands_business_id' })
  business?: Business

  @Column()
  name!: string

  @Column()
  slug!: string

  @Column({ name: 'logo_url', nullable: true, type: 'varchar' })
  logoUrl?: string | null

  @Column({ nullable: true, type: 'text' })
  description?: string | null

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @OneToMany(() => Model, (model) => model.brand)
  models?: Model[]

  @OneToMany(() => BrandCategory, (link) => link.brand)
  categoryLinks?: BrandCategory[]
}
