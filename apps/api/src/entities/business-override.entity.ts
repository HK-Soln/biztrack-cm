import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { dateTransformer } from '@/common/entities/transformers'

@Entity('business_overrides')
@Index('idx_business_overrides_business_id', ['businessId'])
@Index('idx_business_overrides_expires_at', ['expiresAt'])
export class BusinessOverride extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.overrides, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_business_overrides_business_id' })
  business?: Business

  @Column()
  resource!: string

  @Column({ default: true })
  granted!: boolean

  @Column({ name: 'granted_by' })
  grantedBy!: string

  @Column()
  reason!: string

  @Column({ name: 'granted_at', transformer: dateTransformer })
  grantedAt!: Date

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  expiresAt?: Date | null
}
