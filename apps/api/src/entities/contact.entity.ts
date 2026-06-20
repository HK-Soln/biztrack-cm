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
import { ContactType, type IdDocumentType } from '@biztrack/types'
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

  @Column({ nullable: true, type: 'varchar', length: 200 })
  email?: string | null

  @Column({ nullable: true, type: 'text' })
  address?: string | null

  @Column({ nullable: true, type: 'text' })
  notes?: string | null

  @Column({ name: 'id_type', type: 'varchar', length: 30, nullable: true })
  idType?: IdDocumentType | null

  @Column({ name: 'id_number', type: 'varchar', length: 100, nullable: true })
  idNumber?: string | null

  @Column({ name: 'id_issue_date', type: 'date', nullable: true })
  idIssueDate?: string | null

  @Column({ name: 'id_expiry_date', type: 'date', nullable: true })
  idExpiryDate?: string | null

  @Column({ name: 'id_documents', type: 'jsonb', nullable: true })
  idDocuments?: string[] | null

  @Column({ name: 'selfie_url', type: 'varchar', length: 1024, nullable: true })
  selfieUrl?: string | null

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
