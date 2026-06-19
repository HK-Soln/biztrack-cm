import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm'
import { RfqStatus } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { RfqItem } from './rfq-item.entity'
import { RfqSupplier } from './rfq-supplier.entity'

@Entity('rfqs')
@Index('idx_rfqs_business_id_deleted_at', ['businessId', 'deletedAt'])
@Index('idx_rfqs_business_id_status', ['businessId', 'status'])
export class Rfq extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_rfqs_business_id' })
  business?: Business

  @Column()
  number!: string

  @Column({ nullable: true, type: 'varchar' })
  title?: string | null

  @Column({ name: 'message_body', nullable: true, type: 'text' })
  messageBody?: string | null

  @Column({ type: 'varchar', default: RfqStatus.DRAFT })
  status!: RfqStatus

  @Column({ type: 'varchar', default: 'XAF' })
  currency!: string

  @Column({ name: 'created_by_id', nullable: true, type: 'uuid' })
  createdById?: string | null

  @OneToMany(() => RfqItem, (item) => item.rfq)
  items?: RfqItem[]

  @OneToMany(() => RfqSupplier, (s) => s.rfq)
  suppliers?: RfqSupplier[]
}
