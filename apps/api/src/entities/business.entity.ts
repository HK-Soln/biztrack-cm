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
import {
  SubscriptionPlan,
  BusinessStatus,
  FiscalRegime,
  BillingCycle,
  BusinessProfileTier,
  MemberAuthCredentialType,
} from '@biztrack/types'
import type { BusinessHours } from '@biztrack/types'
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

  @Column({ name: 'logo_url', nullable: true, type: 'varchar' })
  logoUrl?: string | null

  /** Per-weekday opening hours (null day = closed). Drives the daily-digest send time. */
  @Column({ name: 'business_hours', type: 'jsonb', nullable: true })
  businessHours?: BusinessHours | null

  /** Default credit period (days) for on-account sales; drives the effective due date
   * used by ageing + debt-due reminders when a debt has no explicit due_date (D9). */
  @Column({ name: 'default_credit_days', type: 'int', default: 30 })
  defaultCreditDays!: number

  /** Canonical business timezone (IANA, e.g. Africa/Douala). The single source of truth
   * for every local-time decision — business_date (BIZ-5.1), digest send time, quiet
   * hours. Notifications read this, not the (now dormant) notification_settings.timezone. */
  @Column({ name: 'timezone', type: 'varchar', length: 64, default: 'Africa/Douala' })
  timezone!: string

  /** Local time of day at which the trading day rolls over (HH:mm). Default 00:00 = the
   * business_date is the local calendar date; a late-night trade sets a dead-hour cutover
   * (e.g. 03:00) so a 01:00 sale counts to the previous trading day (BIZ-5.1). */
  @Column({ name: 'day_cutover_time', type: 'varchar', length: 5, default: '00:00' })
  dayCutoverTime!: string

  /** Month (1–12) the fiscal year begins in; default 1 = January (OHADA). Anchors the fiscal
   * calendar — the fiscal_years + accounting_periods generated for the business (BIZ-5.2). */
  @Column({ name: 'fiscal_year_start_month', type: 'int', default: 1 })
  fiscalYearStartMonth!: number

  /** Business size profile (MICRO | SMALL | SME) — sets defaults + drives profile-aware
   * vocabulary in the client (BIZ-5.7). */
  @Column({ name: 'profile', type: 'varchar', length: 16, default: BusinessProfileTier.SMALL })
  profile!: BusinessProfileTier

  /** Authorization methods accepted at step-up (BIZ-3.3). null ⇒ both PIN + CARD. */
  @Column({ name: 'allowed_auth_methods', type: 'jsonb', nullable: true })
  allowedAuthMethods!: MemberAuthCredentialType[] | null

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

  @Column({
    name: 'subscription_status',
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIAL,
  })
  subscriptionStatus!: SubscriptionStatus

  @Column({
    name: 'billing_cycle',
    type: 'enum',
    enum: BillingCycle,
    default: BillingCycle.MONTHLY,
  })
  billingCycle!: BillingCycle

  @Column({
    name: 'business_status',
    type: 'enum',
    enum: BusinessStatus,
    default: BusinessStatus.ONBOARDING,
  })
  businessStatus!: BusinessStatus

  @Column({
    name: 'trial_started_at',
    type: 'timestamp',
    nullable: true,
    transformer: dateTransformer,
  })
  trialStartedAt?: Date | null

  @Column({
    name: 'trial_ends_at',
    type: 'timestamp',
    nullable: true,
    transformer: dateTransformer,
  })
  trialEndsAt?: Date | null

  @Column({
    name: 'current_period_start',
    type: 'timestamp',
    nullable: true,
    transformer: dateTransformer,
  })
  currentPeriodStart?: Date | null

  @Column({
    name: 'current_period_end',
    type: 'timestamp',
    nullable: true,
    transformer: dateTransformer,
  })
  currentPeriodEnd?: Date | null

  @Column({ name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd!: boolean

  // --- Fiscal / OHADA identifiers. Captured at setup; not yet used by any tax
  // computation (deferred OHADA accounting feature). ---
  @Column({ name: 'niu', type: 'varchar', nullable: true })
  niu?: string | null

  @Column({ name: 'rccm', type: 'varchar', nullable: true })
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
