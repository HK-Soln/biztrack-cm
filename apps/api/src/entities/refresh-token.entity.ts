import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { User } from './user.entity'

@Entity('refresh_tokens')
@Index('unq_refresh_tokens_token', ['token'], { unique: true })
export class RefreshToken extends ImmutableBaseEntity {
  @Column()
  token!: string

  @Column({ name: 'user_id' })
  userId!: string

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_refresh_tokens_user_id' })
  user?: User

  @Column({ name: 'device_id', nullable: true })
  deviceId?: string

  @Column({ name: 'expires_at', transformer: dateTransformer })
  expiresAt!: Date
}
