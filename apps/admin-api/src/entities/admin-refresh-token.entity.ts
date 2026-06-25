import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { AdminUser } from './admin-user.entity'

@Entity('admin_refresh_tokens')
@Index('unq_admin_refresh_tokens_token_id', ['tokenId'], { unique: true })
@Index('idx_admin_refresh_tokens_family_id', ['familyId'])
export class AdminRefreshToken extends ImmutableBaseEntity {
  @Column({ name: 'token_id' })
  tokenId!: string

  @Column({ name: 'token_hash' })
  tokenHash!: string

  @Column({ name: 'family_id' })
  familyId!: string

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId!: string

  @ManyToOne(() => AdminUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_user_id', foreignKeyConstraintName: 'fk_admin_refresh_tokens_admin_user_id' })
  adminUser?: AdminUser

  @Column({ name: 'expires_at', transformer: dateTransformer })
  expiresAt!: Date

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  usedAt?: Date | null

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  revokedAt?: Date | null
}
