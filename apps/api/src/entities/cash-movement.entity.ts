import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import type { CashMovementDirection, CashMovementKind } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { CashSession } from './cash-session.entity'
import { User } from './user.entity'

/**
 * A non-sale cash event at a till (BIZ-2.3). Named CashMovement, never bare "movement"
 * (inventory_movements owns that). Append-only by service discipline; extends BaseEntity
 * so `updated_at` drives the sync pull cursor (`amount` is `bigint` whole XAF, positive —
 * the sign is carried by `direction`).
 */
@Entity('cash_movements')
@Index('idx_cash_movements_session', ['cashSessionId'])
@Index('idx_cash_movements_business_updated_at', ['businessId', 'updatedAt'])
export class CashMovement extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_cash_movements_business_id' })
  business?: Business

  @Column({ name: 'cash_session_id', type: 'uuid' })
  cashSessionId!: string

  @ManyToOne(() => CashSession, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'cash_session_id',
    foreignKeyConstraintName: 'fk_cash_movements_cash_session_id',
  })
  cashSession?: CashSession

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_cash_movements_user_id' })
  user?: User

  @Column({ type: 'varchar', length: 40 })
  kind!: CashMovementKind

  @Column({ type: 'varchar', length: 10 })
  direction!: CashMovementDirection

  @Column({ type: 'bigint', transformer: decimalTransformer })
  amount!: number

  @Column({ type: 'text', nullable: true })
  note?: string | null

  @Column({ name: 'reference_type', type: 'varchar', length: 30, nullable: true })
  referenceType?: string | null

  // Not a uuid column: a debt's id can be a synthetic composite (e.g. "debt:sale:<uuid>")
  // pulled from sync, so this holds any reference id, not just a bare uuid.
  @Column({ name: 'reference_id', type: 'varchar', length: 80, nullable: true })
  referenceId?: string | null

  // Local trading day (BIZ-5.1), inherited from the parent shift's business_date.
  @Column({ name: 'business_date', type: 'date', nullable: true })
  businessDate?: string | null
}
