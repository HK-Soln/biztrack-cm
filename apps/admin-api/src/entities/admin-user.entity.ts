import { Column, Entity, Index, JoinColumn, ManyToOne, UpdateDateColumn } from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { AdminRole } from './admin-role.entity'

@Entity('admin_users')
@Index('unq_admin_users_email', ['email'], { unique: true })
export class AdminUser extends ImmutableBaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email!: string

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string

  @Column({ name: 'admin_role_id', type: 'uuid' })
  adminRoleId!: string

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  /** Static escape-hatch flag. Set only via migration/seed — never through the API. */
  @Column({ name: 'is_super_admin', type: 'boolean', default: false })
  isSuperAdmin!: boolean

  /** Forces a password change on next login (set on creation). */
  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword!: boolean

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts!: number

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  lockedUntil?: Date | null

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  lastLoginAt?: Date | null

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @UpdateDateColumn({ name: 'updated_at', transformer: dateTransformer })
  updatedAt!: Date

  @ManyToOne(() => AdminRole, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'admin_role_id', foreignKeyConstraintName: 'fk_admin_users_role_id' })
  role?: AdminRole
}
