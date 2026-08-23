import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * BIZ-5.3 — records that a close step ran for a (period, close_version). The UNIQUE key
 * (period_id, step_key, close_version) makes the close pipeline idempotent: a retried close
 * (e.g. after a crash recovered CLOSING → OPEN) skips steps already recorded here. Server-only,
 * append-only bookkeeping — not a synced entity.
 */
@Entity('period_close_runs')
@Index('unq_period_close_runs_step_period_version', ['periodId', 'stepKey', 'closeVersion'], {
  unique: true,
})
export class PeriodCloseRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'period_id', type: 'uuid' })
  periodId!: string

  @Column({ name: 'close_version', type: 'int', default: 0 })
  closeVersion!: number

  @Column({ name: 'step_key', type: 'varchar', length: 80 })
  stepKey!: string

  @Column({ type: 'varchar', length: 20, default: 'COMPLETED' })
  status!: string

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown> | null

  @Column({ name: 'ran_at', type: 'timestamptz' })
  ranAt!: Date
}
