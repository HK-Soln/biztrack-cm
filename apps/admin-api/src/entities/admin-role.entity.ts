import { Column, Entity, Index, OneToMany, UpdateDateColumn } from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { AdminRolePermission } from './admin-role-permission.entity'

@Entity('admin_roles')
@Index('unq_admin_roles_name', ['name'], { unique: true })
export class AdminRole extends ImmutableBaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  /** true for FINANCE/SUPPORT/TECHNICAL/SUPER_ADMIN — name cannot be deleted/renamed. */
  @Column({ name: 'is_system_role', type: 'boolean', default: false })
  isSystemRole!: boolean

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @UpdateDateColumn({ name: 'updated_at', transformer: dateTransformer })
  updatedAt!: Date

  @OneToMany(() => AdminRolePermission, (rp) => rp.role)
  permissions?: AdminRolePermission[]
}
