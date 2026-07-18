import { Column, Entity } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'

/**
 * Read/limited-write mapping onto the client-owned `users` table (the business owners
 * and staff — distinct from admin_users). Named ClientUser to avoid confusion with AdminUser.
 */
@Entity('users')
export class ClientUser extends BaseEntity {
  @Column({ name: 'name' })
  name!: string

  @Column({ name: 'phone', type: 'varchar' })
  phone!: string

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email?: string | null

  @Column({ name: 'role', type: 'varchar' })
  role!: string

  @Column({ name: 'language', type: 'varchar' })
  language!: string

  @Column({ name: 'is_email_verified', type: 'boolean' })
  isEmailVerified!: boolean

  @Column({ name: 'is_phone_verified', type: 'boolean' })
  isPhoneVerified!: boolean

  @Column({ name: 'status', type: 'varchar' })
  status!: string

  @Column({ name: 'onboarding_step', type: 'varchar' })
  onboardingStep!: string

  @Column({ name: 'is_active', type: 'boolean' })
  isActive!: boolean

  @Column({
    name: 'locked_until',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  lockedUntil?: Date | null

  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId?: string | null
}
