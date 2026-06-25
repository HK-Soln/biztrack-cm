import { UpdateDateColumn, DeleteDateColumn } from 'typeorm'
import { ImmutableBaseEntity } from './immutable-base.entity'
import { dateTransformer } from './transformers'

/**
 * Mutable base entity: id + created_at (from ImmutableBaseEntity) plus
 * updated_at and a soft-delete deleted_at column.
 */
export abstract class BaseEntity extends ImmutableBaseEntity {
  @UpdateDateColumn({ name: 'updated_at', transformer: dateTransformer })
  updatedAt!: Date

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  deletedAt?: Date | null
}
