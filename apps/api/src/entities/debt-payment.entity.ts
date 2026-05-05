import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { PaymentMethod } from '@biztrack/types'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Debt } from './debt.entity'
import { User } from './user.entity'

@Entity('debt_payments')
@Index('idx_debt_payments_business_id', ['businessId'])
@Index('idx_debt_payments_debt_id', ['debtId'])
export class DebtPayment extends ImmutableBaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_debt_payments_business_id' })
  business?: Business

  @Column({ name: 'debt_id' })
  debtId!: string

  @ManyToOne(() => Debt, (debt) => debt.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'debt_id', foreignKeyConstraintName: 'fk_debt_payments_debt_id' })
  debt?: Debt

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number

  @Column({ type: 'varchar' })
  method!: PaymentMethod

  @Column({ name: 'mobile_money_reference', type: 'varchar', length: 100, nullable: true })
  mobileMoneyReference?: string | null

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: string

  @Column({ type: 'text', nullable: true })
  notes?: string | null

  @Column({ name: 'recorded_by' })
  recordedById!: string

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'recorded_by', foreignKeyConstraintName: 'fk_debt_payments_recorded_by' })
  recordedBy?: User
}
