import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { MemberAuthCredentialType } from '@biztrack/types'
import { Business } from './business.entity'
import { BusinessMember } from './business-member.entity'

/**
 * BIZ-3.3 — a member authorization credential (a PIN or a scannable card). Only the hash of the
 * secret is stored; the server never verifies it — verification happens on-device (offline). The
 * hash rides the sync pull so a manager's PIN / card can be verified on any cashier device. A
 * revoked credential (`revokedAt` set) is dead and can never authorize again.
 */
@Entity('member_auth_credentials')
@Index('idx_member_auth_credentials_business_id', ['businessId'])
@Index('idx_member_auth_credentials_member_id', ['memberId'])
export class MemberAuthCredential extends BaseEntity {
  @Column({ name: 'member_id', type: 'uuid' })
  memberId!: string

  @ManyToOne(() => BusinessMember, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member?: BusinessMember

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business?: Business

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Column({ name: 'type', type: 'varchar', length: 16 })
  type!: MemberAuthCredentialType

  /** bcrypt (PIN) or hash of the card token (CARD). Never the plaintext. */
  @Column({ name: 'secret_hash', type: 'text' })
  secretHash!: string

  @Column({ name: 'version', type: 'int', default: 0 })
  version!: number

  @Column({ name: 'issued_by_id', type: 'uuid', nullable: true })
  issuedById!: string | null

  @Column({ name: 'label', type: 'text', nullable: true })
  label!: string | null

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  revokedAt!: Date | null
}
