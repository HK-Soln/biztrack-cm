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

  @Column()
  category!: string

  @Column()
  description!: string

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount!: number

  @Column({ name: 'payment_method' })
  paymentMethod!: string

  @Column({ name: 'receipt_url', nullable: true })
  receiptUrl?: string 

  @Column({ type: 'timestamptz', transformer: dateTransformer })
  date!: Date
}
