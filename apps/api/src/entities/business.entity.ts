import { Entity, Column, OneToMany, OneToOne, JoinColumn, Index } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { User } from './user.entity'
import { Product } from './product.entity'
import { ProductCategory } from './product-category.entity'
import { Sale } from './sale.entity'
import { ExpenseCategory } from './expense-category.entity'
import { Expense } from './expense.entity'
import { MonthlyExpenseSummary } from './monthly-expense-summary.entity'
import { StockMovement } from './stock-movement.entity'
import { SyncLog } from './sync-log.entity'
import { SubscriptionPlan, BusinessStatus, FiscalRegime } from '@biztrack/types'
import { BusinessOverride } from './business-override.entity'
import { SubscriptionEvent } from './subscription-event.entity'
import { BusinessMember } from './business-member.entity'

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  SUSPENDED = 'SUSPENDED',
}

export enum BusinessType {
  EPICERIE = 'EPICERIE',
  BOUTIQUE = 'BOUTIQUE',
  RESTAURANT = 'RESTAURANT',
  PHARMACIE = 'PHARMACIE',
  SALON = 'SALON',
  ELECTRONIQUE = 'ELECTRONIQUE',
  AUTRE = 'AUTRE',
}

@Entity('businesses')
@Index('unq_businesses_slug', ['slug'], { unique: true })
@Index('idx_businesses_owner_id', ['ownerId'])
export class Business extends BaseEntity {
  @Column()
  name!: string

  @Column()
  slug!: string

  @Column({ nullable: true })
  description?: string

  @Column({ nullable: true })
  phone?: string

  @Column({ nullable: true })
  email?: string

  @Column({ nullable: true })
  address?: string

  @Column({ nullable: true })
  city?: string

  @Column({ default: 'CM' })
  country!: string

  @Column({ type: 'enum', enum: BusinessType, default: BusinessType.AUTRE })
  type!: BusinessType

  @Column({ default: 'XAF' })
  currency!: string

  @Column({ name: 'logo_url', nullable: true })
  logoUrl?: string

  @Column({ name: 'owner_id' })
  ownerId!: string

  @OneToOne(() => User, (user) => user.ownedBusiness)
  @JoinColumn({ name: 'owner_id', foreignKeyConstraintName: 'fk_businesses_owner_id' })
  owner?: User

  @OneToMany(() => User, (user) => user.business)
  members?: User[]

  @OneToMany(() => BusinessMember, (member) => member.business)
  businessMembers?: BusinessMember[]

  @Column({ type: 'enum', enum: SubscriptionPlan, default: SubscriptionPlan.FREE })
  plan!: SubscriptionPlan

  @Column({ name: 'subscription_status', type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.TRIAL })
  subscriptionStatus!: SubscriptionStatus

  @Column({ name: 'business_status', type: 'enum', enum: BusinessStatus, default: BusinessStatus.ONBOARDING })
  businessStatus!: BusinessStatus

  @Column({ name: 'trial_started_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  trialStartedAt?: Date | null

  @Column({ name: 'trial_ends_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  trialEndsAt?: Date | null

  @Column({ name: 'current_period_start', type: 'timestamp', nullable: true, transformer: dateTransformer })
  currentPeriodStart?: Date | null

  @Column({ name: 'current_period_end', type: 'timestamp', nullable: true, transformer: dateTransformer })
  currentPeriodEnd?: Date | null

  @Column({ name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd!: boolean

  // --- Fiscal / OHADA identifiers. Captured at setup; not yet used by any tax
  // computation (deferred OHADA accounting feature). ---
  @Column({ name: 'niu', nullable: true })
  niu?: string | null

  @Column({ name: 'rccm', nullable: true })
  rccm?: string | null

  @Column({ name: 'vat_registered', default: false })
  vatRegistered!: boolean

  @Column({ name: 'default_vat_rate', type: 'decimal', precision: 5, scale: 2, nullable: true })
  defaultVatRate?: number | null

  @Column({ name: 'fiscal_regime', type: 'enum', enum: FiscalRegime, nullable: true })
  fiscalRegime?: FiscalRegime | null

  @OneToMany(() => Product, (product) => product.business)
  products?: Product[]

  @OneToMany(() => ProductCategory, (category) => category.business)
  productCategories?: ProductCategory[]

  @OneToMany(() => Sale, (sale) => sale.business)
  sales?: Sale[]

  @OneToMany(() => Expense, (expense) => expense.business)
  expenses?: Expense[]

  @OneToMany(() => ExpenseCategory, (category) => category.business)
  expenseCategories?: ExpenseCategory[]

  @OneToMany(() => MonthlyExpenseSummary, (summary) => summary.business)
  monthlyExpenseSummaries?: MonthlyExpenseSummary[]

  @OneToMany(() => StockMovement, (movement) => movement.business)
  stockMovements?: StockMovement[]

  @OneToMany(() => SyncLog, (log) => log.business)
  syncLogs?: SyncLog[]

  @OneToMany(() => BusinessOverride, (override) => override.business)
  overrides?: BusinessOverride[]

  @OneToMany(() => SubscriptionEvent, (event) => event.business)
  subscriptionHistory?: SubscriptionEvent[]
}
