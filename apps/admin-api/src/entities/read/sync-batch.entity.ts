import { Column, Entity } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'

/** Mapping onto the client-owned `sync_batches` table — used to surface sync health/errors. */
@Entity('sync_batches')
export class SyncBatch extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'device_id', type: 'varchar' })
  deviceId!: string

  @Column({ name: 'status', type: 'varchar' })
  status!: string

  @Column({ name: 'accepted_count', type: 'int' })
  acceptedCount!: number

  @Column({ name: 'failed_count', type: 'int' })
  failedCount!: number

  @Column({ name: 'conflict_count', type: 'int' })
  conflictCount!: number

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  startedAt?: Date | null

  @Column({
    name: 'completed_at',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  completedAt?: Date | null

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null
}
