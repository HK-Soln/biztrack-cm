import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { ContactType } from '@biztrack/types'
import { dateTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Debt } from './debt.entity'
import { User } from './user.entity'

@Entity('contacts')
@Index('idx_contacts_business_id_type', ['businessId', 'type'])
@Index('idx_contacts_business_id_is_active', ['businessId', 'isActive'])
export class Contact extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_contacts_business_id' })
  business?: Business

  @Column({ type: 'varchar' })
  type!: ContactType

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ nullable: true, type: 'varchar', length: 30 })
  phone?: string | null

  @Column({ name: 'phone_alt', nullable: true, type: 'varchar', length: 30 })
  phoneAlt?: string | null

  @Column({ nullable: true, type: 'text' })
  address?: string | null

  @Column({ nullable: true, type: 'text' })
  notes?: string | null

  @Column({ name: 'is_active', default: true })
  isActive!: boolean

  @Column({ name: 'created_by' })
  createdById!: string

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'fk_contacts_created_by' })
  createdBy?: User

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', transformer: dateTransformer })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', transformer: dateTransformer })
  updatedAt!: Date

  @OneToMany(() => Debt, (debt) => debt.contact)
  debts?: Debt[]
}
