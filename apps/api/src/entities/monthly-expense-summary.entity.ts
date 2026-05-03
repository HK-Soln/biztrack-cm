import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Business } from './business.entity'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'

@Entity('monthly_expense_summaries')
@Index('unq_monthly_expense_summaries_business_id_year_month', ['businessId', 'summaryYear', 'summaryMonth'], {
  unique: true,
})
export class MonthlyExpenseSummary extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.monthlyExpenseSummaries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_monthly_expense_summaries_business_id' })
  business?: Business

  @Column({ name: 'summary_year', type: 'int' })
  summaryYear!: number

  @Column({ name: 'summary_month', type: 'int' })
  summaryMonth!: number

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalAmount!: number

  @Column({ name: 'category_breakdown', type: 'jsonb', default: {} })
  categoryBreakdown!: Record<string, number>

  @Column({ name: 'expense_count', type: 'int', default: 0 })
  expenseCount!: number

  @Column({
    name: 'recurring_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  recurringAmount!: number

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', transformer: dateTransformer })
  updatedAt!: Date
}
