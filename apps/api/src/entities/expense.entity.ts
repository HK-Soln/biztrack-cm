import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { ExpenseCategory } from './expense-category.entity'
import { User } from './user.entity'

@Entity('expenses')
@Index('idx_expenses_business_id_deleted_at', ['businessId', 'deletedAt'])
@Index('idx_expenses_business_id_date', ['businessId', 'date'])
export class Expense extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.expenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_expenses_business_id' })
  business?: Business

  @Column({ name: 'recorded_by_id' })
  recordedById!: string

  @ManyToOne(() => User, (user) => user.expenses)
  @JoinColumn({ name: 'recorded_by_id', foreignKeyConstraintName: 'fk_expenses_recorded_by_id' })
  recordedBy?: User

  @Column({ name: 'category_id' })
  categoryId!: string

  @ManyToOne(() => ExpenseCategory, (category) => category.expenses)
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_expenses_category_id' })
  category?: ExpenseCategory

  @Column()
  description!: string

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount!: number

  @Column({ default: 'XAF' })
  currency!: string

  @Column({ name: 'payment_method' })
  paymentMethod!: string

  @Column({ name: 'receipt_url', nullable: true, type: 'varchar' })
  receiptUrl?: string | null

  @Column({ length: 200, nullable: true, type: 'varchar' })
  vendor?: string | null

  @Column({ type: 'text', nullable: true })
  notes?: string | null

  @Column({ name: 'is_recurring', default: false })
  isRecurring!: boolean

  @Column({ name: 'date', type: 'date', transformer: dateTransformer })
  date!: Date
}
