import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import type { PermissionScope } from '@/common/auth/admin-jwt-payload'
import { AdminRole } from './admin-role.entity'

@Entity('admin_role_permissions')
@Index('unq_admin_role_permissions_role_permission', ['adminRoleId', 'permission'], { unique: true })
@Index('idx_admin_role_permissions_role', ['adminRoleId'])
export class AdminRolePermission extends ImmutableBaseEntity {
  @Column({ name: 'admin_role_id', type: 'uuid' })
  adminRoleId!: string

  @Column({ name: 'permission', type: 'varchar', length: 100 })
  permission!: string

  @Column({ name: 'scope', type: 'jsonb', nullable: true })
  scope?: PermissionScope | null

  @ManyToOne(() => AdminRole, (role) => role.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_role_id', foreignKeyConstraintName: 'fk_admin_role_permissions_role_id' })
  role?: AdminRole
}
