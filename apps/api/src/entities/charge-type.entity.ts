import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { ChargeRateType } from '@biztrack/types'
import { decimalTransformer } from '@/common/entities/transformers'

/**
 * Reusable charge catalog (TVA, transport, service…). System rows (business_id NULL,
 * is_system) ship seeded; businesses may add their own. Read-only catalog for now —
 * surfaced to the cloud build via GET /charges. Table created in the charge_types migration.
 */
@Entity('charge_types')
@Index('idx_charge_types_business_id', ['businessId'])
export class ChargeType {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId!: string | null

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'text', nullable: true })
  description?: string | null

  @Column({ name: 'rate_type', type: 'varchar', length: 10, default: 'FIXED' })
  rateType!: ChargeRateType

  @Column({ name: 'default_value', type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  defaultValue!: number

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
