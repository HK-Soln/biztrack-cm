import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Contact } from './contact.entity'
import { RestockItem } from './restock-item.entity'
import { RestockPayment } from './restock-payment.entity'
import { User } from './user.entity'

@Entity('restock_records')
@Index('idx_restock_records_business_id', ['businessId'])
export class RestockRecord extends ImmutableBaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_restock_records_business_id' })
  business?: Business

  @Column({ name: 'reference_number', nullable: true, type: 'varchar' })
  referenceNumber?: string | null

  @Column({ name: 'supplier_name', nullable: true, type: 'varchar' })
  supplierName?: string | null

  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  totalCost?: number | null

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalAmount!: number

  @Column({
    name: 'amount_paid',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amountPaid!: number

  @Column({
    name: 'credit_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  creditAmount!: number

  @Column({ name: 'supplier_id', nullable: true, type: 'uuid' })
  supplierId?: string | null

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'supplier_id', foreignKeyConstraintName: 'fk_restock_records_supplier_id' })
  supplier?: Contact | null

  /** The purchase order this receipt fulfils (if any). */
  @Column({ name: 'purchase_order_id', nullable: true, type: 'uuid' })
  purchaseOrderId?: string | null

  @Column({ nullable: true, type: 'text' })
  notes?: string | null

  @Column({ name: 'performed_by', nullable: true })
  performedById?: string | null

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'performed_by', foreignKeyConstraintName: 'fk_restock_records_performed_by' })
  performedBy?: User | null

  @OneToMany(() => RestockItem, (item) => item.restockRecord, { cascade: false })
  items?: RestockItem[]

  @OneToMany(() => RestockPayment, (payment) => payment.restockRecord, { cascade: false })
  payments?: RestockPayment[]
}
