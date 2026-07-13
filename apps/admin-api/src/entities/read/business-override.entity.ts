import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'

/** Mapping onto the client-owned `business_overrides` table (resource grants beyond plan). */
@Entity('business_overrides')
export class BusinessOverride extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'resource', type: 'varchar' })
  resource!: string

  @Column({ name: 'granted', type: 'boolean' })
  granted!: boolean

  @Column({ name: 'granted_by', type: 'varchar' })
  grantedBy!: string

  @Column({ name: 'reason', type: 'varchar' })
  reason!: string

  @Column({ name: 'granted_at', type: 'timestamptz', transformer: dateTransformer })
  grantedAt!: Date

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  expiresAt?: Date | null

  @ManyToOne(() => Business, (b) => b.overrides, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business?: Business
}
