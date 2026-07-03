import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index, Unique } from 'typeorm'
import { AttributeDisplayType } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { AttributeOption } from './attribute-option.entity'

@Entity('attribute_groups')
@Unique('uq_attribute_group_name', ['businessId', 'name'])
@Index('idx_attribute_groups_business', ['businessId'])
export class AttributeGroup extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_attribute_groups_business_id' })
  business?: Business

  @Column()
  name!: string

  // CHIPS | SWATCHES | DROPDOWN (varchar + DB CHECK, see migration)
  @Column({ name: 'display_type', type: 'varchar', length: 20, default: AttributeDisplayType.CHIPS })
  displayType!: AttributeDisplayType

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @OneToMany(() => AttributeOption, (option) => option.group)
  options?: AttributeOption[]

  /** Transient (not persisted): how many categories this group is linked to. Populated
   * by listGroups so list responses can show the attachment count. */
  categoryCount?: number
}
