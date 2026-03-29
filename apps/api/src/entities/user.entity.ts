import { Entity, Column, OneToMany, ManyToOne, OneToOne, JoinColumn, Index } from 'typeorm'
import { PrefferedPhoneChannel } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { RefreshToken } from './refresh-token.entity'
import { Business } from './business.entity'
import { Sale } from './sale.entity'
import { Expense } from './expense.entity'
import { StockMovement } from './stock-movement.entity'

export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  ADMIN = 'ADMIN',
}

@Entity('users')
@Index('unq_users_email', ['email'], { unique: true, where: 'email IS NOT NULL' })
@Index('unq_users_phone', ['phone'], { unique: true, where: 'phone IS NOT NULL' })
export class User extends BaseEntity {
  @Column({ nullable: true, type: 'varchar', length: 255, transformer: { to: (value) => value?.toLowerCase(), from: (value) => value } })
  email!: string | null

  @Column({ transformer: { to: (value) => value?.toLowerCase(), from: (value) => value } })
  phone!: string

  @Column()
  name!: string

  @Column({ name: 'password_hash', nullable: true, type: 'varchar' })
  passwordHash?: string | null

  @Column({ name: 'avatar_url', nullable: true, type: 'varchar' })
  avatarUrl!: string | null

  @Column({ type: 'enum', enum: UserRole, default: UserRole.OWNER })
  role!: UserRole

  @Column({ default: 'fr' })
  language!: string

  @Column({ name: 'is_email_verified', default: false })
  isEmailVerified!: boolean

  @Column({ name: 'is_phone_verified', default: false })
  isPhoneVerified!: boolean

  @Column({
    name: 'preferred_phone_channel',
    type: 'enum',
    enum: PrefferedPhoneChannel,
    default: PrefferedPhoneChannel.SMS,
  })
  preferredPhoneChannel!: PrefferedPhoneChannel

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ name: 'business_id', nullable: true, type: 'uuid' })
  businessId!: string | null

  @ManyToOne(() => Business, (business) => business.members, { nullable: true })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_users_business_id' })
  business?: Business

  @OneToOne(() => Business, (business) => business.owner)
  ownedBusiness?: Business

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens?: RefreshToken[]

  @OneToMany(() => Sale, (sale) => sale.cashier)
  sales?: Sale[]

  @OneToMany(() => Expense, (expense) => expense.recordedBy)
  expenses?: Expense[]

  @OneToMany(() => StockMovement, (movement) => movement.recordedBy)
  stockMovements?: StockMovement[]
}
