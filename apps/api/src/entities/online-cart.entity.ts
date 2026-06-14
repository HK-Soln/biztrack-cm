import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { OnlineCartItem } from '@biztrack/types'

/** Anonymous, session-based storefront cart (Phase 3I). */
@Entity('online_carts')
@Index('idx_online_carts_store', ['onlineStoreId'])
export class OnlineCart {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'online_store_id' })
  onlineStoreId!: string

  @Column({ name: 'session_token', length: 200, unique: true })
  sessionToken!: string

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items!: OnlineCartItem[]

  @Column({ name: 'customer_email', length: 300, nullable: true, type: 'varchar' })
  customerEmail?: string | null

  @Column({ name: 'customer_name', length: 200, nullable: true, type: 'varchar' })
  customerName?: string | null

  @Column({ name: 'customer_phone', length: 30, nullable: true, type: 'varchar' })
  customerPhone?: string | null

  @Column({ type: 'text', nullable: true })
  notes?: string | null

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
