import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { AttributeGroup } from './attribute-group.entity'

@Entity('attribute_options')
@Unique('uq_attribute_option_value', ['groupId', 'value'])
@Index('idx_attribute_options_group', ['groupId'])
export class AttributeOption extends BaseEntity {
  @Column({ name: 'group_id' })
  groupId!: string

  @ManyToOne(() => AttributeGroup, (group) => group.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id', foreignKeyConstraintName: 'fk_attribute_options_group_id' })
  group?: AttributeGroup

  @Column({ name: 'business_id' })
  businessId!: string

  @Column()
  value!: string

  @Column({ name: 'color_hex', type: 'varchar', length: 7, nullable: true })
  colorHex?: string | null

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @Column({ name: 'is_active', default: true })
  isActive!: boolean
}
