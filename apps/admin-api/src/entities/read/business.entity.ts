import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { ClientUser } from './client-user.entity'
import { BusinessMember } from './business-member.entity'
import { BusinessOverride } from './business-override.entity'

/**
 * Read/limited-write mapping onto the client-owned `businesses` table. Only the columns
 * the admin dashboard reads or mutates are declared; the schema is owned by apps/api.
 */
@Entity('businesses')
export class Business extends BaseEntity {
  @Column({ name: 'name' })
  name!: string

  @Column({ name: 'slug' })
  slug!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ name: 'city', type: 'varchar', nullable: true })
  city?: string | null

  @Column({ name: 'country', type: 'varchar' })
  country!: string

  @Column({ name: 'phone', type: 'varchar', nullable: true })
  phone?: string | null

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email?: string | null

  @Column({ name: 'plan', type: 'varchar' })
  plan!: string

  @Column({ name: 'subscription_status', type: 'varchar' })
  subscriptionStatus!: string

  @Column({ name: 'business_status', type: 'varchar' })
  businessStatus!: string

  @Column({ name: 'billing_cycle', type: 'varchar' })
  billingCycle!: string

  @Column({
    name: 'trial_started_at',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  trialStartedAt?: Date | null

  @Column({
    name: 'trial_ends_at',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  trialEndsAt?: Date | null

  @Column({
    name: 'current_period_start',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  currentPeriodStart?: Date | null

  @Column({
    name: 'current_period_end',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  currentPeriodEnd?: Date | null

  @Column({ name: 'cancel_at_period_end', type: 'boolean' })
  cancelAtPeriodEnd!: boolean

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string

  @OneToOne(() => ClientUser)
  @JoinColumn({ name: 'owner_id' })
  owner?: ClientUser

  @OneToMany(() => BusinessMember, (m) => m.business)
  members?: BusinessMember[]

  @OneToMany(() => BusinessOverride, (o) => o.business)
  overrides?: BusinessOverride[]
}
