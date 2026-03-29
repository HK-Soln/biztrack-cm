import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { Business } from './business.entity'

@Entity('sync_logs')
@Index('idx_sync_logs_business_id_device_id', ['businessId', 'deviceId'])
export class SyncLog extends ImmutableBaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.syncLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_sync_logs_business_id' })
  business?: Business

  @Column({ name: 'device_id' })
  deviceId!: string

  @Column({ name: 'pushed_count', default: 0 })
  pushedCount!: number

  @Column({ name: 'pulled_count', default: 0 })
  pulledCount!: number

  @Column({ name: 'conflict_count', default: 0 })
  conflictCount!: number
}
