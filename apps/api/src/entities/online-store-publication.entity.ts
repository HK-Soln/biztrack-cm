import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import type { OnlineStorePublishedConfig } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { OnlineStore } from './online-store.entity'

/**
 * An immutable, versioned snapshot of a store's published configuration. Written once per
 * publish; the public storefront reads the LATEST one for a store (never the editable draft).
 * Gives an audit trail (who/when/what) and enables rollback (restore = republish an old config).
 */
@Entity('online_store_publications')
@Unique('unq_online_store_publications_store_version', ['onlineStoreId', 'version'])
@Index('idx_online_store_publications_store', ['onlineStoreId'])
export class OnlineStorePublication extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @Column({ name: 'online_store_id' })
  onlineStoreId!: string

  @ManyToOne(() => OnlineStore, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'online_store_id',
    foreignKeyConstraintName: 'fk_online_store_publications_store_id',
  })
  store?: OnlineStore

  /** Monotonic per store: 1, 2, 3 … */
  @Column({ type: 'int' })
  version!: number

  /** The full published-facing config at publish time. */
  @Column({ type: 'jsonb' })
  config!: OnlineStorePublishedConfig

  @Column({ name: 'published_by_id', type: 'uuid', nullable: true })
  publishedById?: string | null

  @Column({ name: 'published_by_name', length: 200, nullable: true, type: 'varchar' })
  publishedByName?: string | null

  /** Set when this publish restored an earlier version (rollback provenance). */
  @Column({ name: 'source_version', type: 'int', nullable: true })
  sourceVersion?: number | null
}
