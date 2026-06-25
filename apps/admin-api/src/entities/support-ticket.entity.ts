import { Column, Entity, Index, UpdateDateColumn } from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { dateTransformer } from '@/common/entities/transformers'

export enum TicketCategory {
  SYNC = 'SYNC',
  PAYMENT = 'PAYMENT',
  APP = 'APP',
  HARDWARE = 'HARDWARE',
  FEEDBACK = 'FEEDBACK',
  OTHER = 'OTHER',
}

export enum TicketSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

@Entity('support_tickets')
@Index('idx_support_tickets_status', ['status'])
@Index('idx_support_tickets_business', ['businessId'])
@Index('idx_support_tickets_assigned', ['assignedTo'])
export class SupportTicket extends ImmutableBaseEntity {
  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId?: string | null

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo?: string | null

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string

  @Column({ name: 'description', type: 'text' })
  description!: string

  @Column({ name: 'category', type: 'varchar', length: 20 })
  category!: TicketCategory

  @Column({ name: 'severity', type: 'varchar', length: 20 })
  severity!: TicketSeverity

  @Column({ name: 'status', type: 'varchar', length: 20, default: TicketStatus.OPEN })
  status!: TicketStatus

  @Column({ name: 'resolution', type: 'text', nullable: true })
  resolution?: string | null

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  resolvedAt?: Date | null

  @UpdateDateColumn({ name: 'updated_at', transformer: dateTransformer })
  updatedAt!: Date
}
