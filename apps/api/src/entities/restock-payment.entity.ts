import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { PaymentMethod } from '@biztrack/types'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { RestockRecord } from './restock-record.entity'

@Entity('restock_payments')
@Index('idx_restock_payments_restock_record_id', ['restockRecordId'])
@Index('idx_restock_payments_business_id', ['businessId'])
export class RestockPayment extends ImmutableBaseEntity {
  @Column({ name: 'restock_record_id' })
  restockRecordId!: string

  @ManyToOne(() => RestockRecord, (record) => record.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restock_record_id', foreignKeyConstraintName: 'fk_restock_payments_restock_record_id' })
  restockRecord?: RestockRecord

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_restock_payments_business_id' })
  business?: Business

  @Column({ type: 'varchar' })
  method!: PaymentMethod

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number

  @Column({ name: 'mobile_money_reference', type: 'varchar', length: 100, nullable: true })
  mobileMoneyReference?: string | null
}
