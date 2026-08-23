import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { CashSession } from './cash-session.entity'

/**
 * One denomination row of a cash session's closing count (BIZ-2.1): the cashier
 * recorded `quantity` notes/coins of face value `denomination`. The drawer total is
 * Σ(denomination × quantity). Rows are written at close and never edited afterwards
 * (the session locks at CLOSED); extends BaseEntity for sync-pull uniformity.
 */
@Entity('cash_count_lines')
@Index('idx_cash_count_lines_cash_session_id', ['cashSessionId'])
export class CashCountLine extends BaseEntity {
  @Column({ name: 'cash_session_id', type: 'uuid' })
  cashSessionId!: string

  @ManyToOne(() => CashSession, (session) => session.countLines, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'cash_session_id',
    foreignKeyConstraintName: 'fk_cash_count_lines_cash_session_id',
  })
  cashSession?: CashSession

  // XAF face value (10000/5000/2000/1000/500 notes; 500/100/50/25/10/5 coins).
  @Column({ type: 'int' })
  denomination!: number

  @Column({ type: 'int', default: 0 })
  quantity!: number
}
