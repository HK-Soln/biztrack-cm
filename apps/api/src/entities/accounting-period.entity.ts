import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { PeriodStatus } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { FiscalYear } from './fiscal-year.entity'

/**
 * One monthly accounting period within a fiscal year (BIZ-5.2). Twelve are generated eagerly per
 * fiscal year. `status` follows the close lifecycle (OPEN → CLOSING → CLOSED → LOCKED), driven by
 * the close pipeline (BIZ-5.3). Extends BaseEntity so `updated_at` drives the sync pull cursor.
 */
@Entity('accounting_periods')
@Index('idx_accounting_periods_business_updated_at', ['businessId', 'updatedAt'])
@Index('idx_accounting_periods_fiscal_year', ['fiscalYearId'])
export class AccountingPeriod extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'business_id',
    foreignKeyConstraintName: 'fk_accounting_periods_business_id',
  })
  business?: Business

  @Column({ name: 'fiscal_year_id', type: 'uuid' })
  fiscalYearId!: string

  @ManyToOne(() => FiscalYear, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'fiscal_year_id',
    foreignKeyConstraintName: 'fk_accounting_periods_fiscal_year_id',
  })
  fiscalYear?: FiscalYear

  @Column({ name: 'period_number', type: 'int' })
  periodNumber!: number

  @Column({ type: 'varchar', length: 10 })
  label!: string

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string

  @Column({ type: 'varchar', length: 20, default: PeriodStatus.OPEN })
  status!: PeriodStatus

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  closedAt?: Date | null
}
