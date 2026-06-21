import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Contact } from './contact.entity'

@Entity('savings_accounts')
// At most one OPEN session per customer; closed sessions accumulate as history.
@Index('uq_savings_open_per_customer', ['businessId', 'customerId'], { unique: true, where: `status = 'OPEN' AND is_deleted = false` })
@Unique('unq_savings_business_account_number', ['businessId', 'accountNumber'])
@Index('idx_savings_accounts_business_created_at', ['businessId', 'createdAt'])
export class CustomerDeposit extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_savings_accounts_business_id' })
  business?: Business

  @Column({ name: 'customer_id' })
  customerId!: string

  @ManyToOne(() => Contact, { onDelete: 'NO ACTION', nullable: false })
  @JoinColumn({ name: 'customer_id', foreignKeyConstraintName: 'fk_savings_accounts_customer_id' })
  customer?: Contact

  @Column({ name: 'customer_name', type: 'varchar', length: 200, nullable: true })
  customerName?: string | null

  @Column({ name: 'customer_phone', type: 'varchar', length: 30, nullable: true })
  customerPhone?: string | null

  @Column({ name: 'account_number', type: 'varchar', length: 50 })
  accountNumber!: string

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  balance!: number

  @Column({
    name: 'total_deposited',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalDeposited!: number

  @Column({
    name: 'total_refunded',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalRefunded!: number

  @Column({
    name: 'total_used',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalUsed!: number

  @Column({
    name: 'total_transferred',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalTransferred!: number

  /** Session lifecycle. */
  @Column({ type: 'varchar', length: 10, default: 'OPEN' })
  status!: string

  @Column({ type: 'varchar', length: 30, nullable: true })
  outcome?: string | null

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  closedAt?: Date | null

  @Column({ name: 'closed_by_id', type: 'uuid', nullable: true })
  closedById?: string | null

  /** When the leftover was transferred, the new session it went to. */
  @Column({ name: 'transferred_to_id', type: 'uuid', nullable: true })
  transferredToId?: string | null

  @Column({ name: 'tagged_products', type: 'jsonb', nullable: true })
  taggedProducts?: Array<{ productId: string; productName: string }> | null

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', transformer: dateTransformer })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', transformer: dateTransformer })
  updatedAt!: Date

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  deletedAt?: Date | null

}

// Backwards-compat alias
export { CustomerDeposit as SavingsAccount }
