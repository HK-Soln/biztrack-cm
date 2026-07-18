import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { User } from './user.entity'
import { VerificationChannel } from '@biztrack/types'

export enum VerificationPurpose {
  REGISTER = 'REGISTER',
  LOGIN = 'LOGIN',
  VERIFY_PHONE = 'VERIFY_PHONE',
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

@Entity('verification_codes')
@Index('idx_verification_codes_user_id', ['userId'])
@Index('idx_verification_codes_channel_purpose', ['channel', 'purpose'])
export class VerificationCode extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_verification_codes_user_id' })
  user?: User

  @Column({ type: 'enum', enum: VerificationChannel })
  channel!: VerificationChannel

  @Column({ type: 'enum', enum: VerificationPurpose })
  purpose!: VerificationPurpose

  @Column({ name: 'code_hash' })
  codeHash!: string

  @Column({ type: 'int', default: 0 })
  attempts!: number

  @Column({ name: 'expires_at', type: 'timestamptz', transformer: dateTransformer })
  expiresAt!: Date

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  usedAt?: Date | null
}
