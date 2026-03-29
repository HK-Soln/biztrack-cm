import {
  BaseEntity as TypeOrmBaseEntity,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { dateTransformer } from './transformers'

export abstract class ImmutableBaseEntity extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @CreateDateColumn({ name: 'created_at', transformer: dateTransformer })
  createdAt!: Date
}
