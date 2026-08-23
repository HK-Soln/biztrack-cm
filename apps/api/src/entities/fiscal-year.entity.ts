import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'

/**
 * A business's fiscal year (BIZ-5.2), keyed by its START calendar year. Generated eagerly with
 * its 12 accounting periods. Extends BaseEntity so `updated_at` drives the sync pull cursor.
 */
@Entity('fiscal_years')
@Index('idx_fiscal_years_business_updated_at', ['businessId', 'updatedAt'])
export class FiscalYear extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_fiscal_years_business_id' })
  business?: Business

  @Column({ type: 'int' })
  year!: number

  @Column({ type: 'varchar', length: 20 })
  label!: string

  @Column({ name: 'start_month', type: 'int' })
  startMonth!: number

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string
}
