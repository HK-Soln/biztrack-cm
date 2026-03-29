import {
  BaseEntity as TypeOrmBaseEntity,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { dateTransformer } from './transformers'

export abstract class BaseEntity extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @CreateDateColumn({ name: 'created_at', transformer: dateTransformer })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', transformer: dateTransformer })
  updatedAt!: Date

  @DeleteDateColumn({ name: 'deleted_at', transformer: dateTransformer })
  deletedAt?: Date | null
}
