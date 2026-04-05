import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { User } from './user.entity'

@Entity('refresh_tokens')
@Index('unq_refresh_tokens_token_id', ['tokenId'], { unique: true })
export class RefreshToken extends ImmutableBaseEntity {
  @Column({ name: 'token_id' })
  tokenId!: string

  @Column({ name: 'token_hash' })
  tokenHash!: string

  @Column({ name: 'family_id' })
  familyId!: string

  @Column({ name: 'user_id' })
  userId!: string

  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId?: string | null

  @Column({ name: 'token_type', type: 'varchar', default: 'phase2' })
  tokenType!: 'phase1' | 'phase2'

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_refresh_tokens_user_id' })
  user?: User

  @Column({ name: 'device_id', nullable: true })
  deviceId?: string

  @Column({ name: 'expires_at', transformer: dateTransformer })
  expiresAt!: Date

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  usedAt?: Date | null

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  revokedAt?: Date | null
}
