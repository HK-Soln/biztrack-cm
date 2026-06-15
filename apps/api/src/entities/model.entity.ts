import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Brand } from './brand.entity'

@Entity('models')
@Unique('unq_models_brand_id_name', ['brandId', 'name'])
@Index('idx_models_business_id_deleted_at', ['businessId', 'deletedAt'])
export class Model extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @Column({ name: 'brand_id' })
  brandId!: string

  @ManyToOne(() => Brand, (brand) => brand.models, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id', foreignKeyConstraintName: 'fk_models_brand_id' })
  brand?: Brand

  @Column()
  name!: string

  @Column({ nullable: true, type: 'varchar' })
  slug?: string | null

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number
}
