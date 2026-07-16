import { Column, Entity } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'

/** Read/limited-write mapping onto the client-owned `plan_configs` table. */
@Entity('plan_configs')
export class PlanConfig extends BaseEntity {
  @Column({ name: 'plan', type: 'varchar' })
  plan!: string

  @Column({ name: 'resources', type: 'text', array: true })
  resources!: string[]

  @Column({ name: 'quotas', type: 'jsonb' })
  quotas!: Record<string, number | null>

  @Column({ name: 'display_name' })
  displayName!: string

  @Column({ name: 'price_xaf', type: 'int' })
  priceXAF!: number

  @Column({ name: 'price_annual_xaf', type: 'int' })
  priceAnnualXAF!: number

  @Column({ name: 'updated_by' })
  updatedBy!: string
}
