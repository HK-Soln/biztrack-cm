import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm'
import { RfqSupplierStatus } from '@biztrack/types'
import { dateTransformer } from '@/common/entities/transformers'
import { BaseEntity } from '@/common/entities/base.entity'
import { Rfq } from './rfq.entity'

@Entity('rfq_suppliers')
@Index('idx_rfq_suppliers_rfq_id', ['rfqId'])
export class RfqSupplier extends BaseEntity {
  @Column({ name: 'rfq_id' })
  rfqId!: string

  @ManyToOne(() => Rfq, (rfq) => rfq.suppliers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rfq_id', foreignKeyConstraintName: 'fk_rfq_suppliers_rfq_id' })
  rfq?: Rfq

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string

  @Column({ name: 'supplier_name', nullable: true, type: 'varchar' })
  supplierName?: string | null

  @Column({ type: 'varchar', default: RfqSupplierStatus.PENDING })
  status!: RfqSupplierStatus

  @Column({ name: 'quoted_total', nullable: true, type: 'numeric', precision: 14, scale: 2 })
  quotedTotal?: number | null

  @Column({ name: 'quote_notes', nullable: true, type: 'text' })
  quoteNotes?: string | null

  @Column({ name: 'responded_at', nullable: true, type: 'timestamptz', transformer: dateTransformer })
  respondedAt?: Date | null
}
