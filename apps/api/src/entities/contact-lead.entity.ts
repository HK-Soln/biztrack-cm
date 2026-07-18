import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * A lead submitted through the marketing site's contact form (apps/web /contact).
 * Mirrors the waitlist entry: captured on submit, then a support notification +
 * an acknowledgement email to the lead are dispatched.
 */
@Entity('contact_leads')
export class ContactLead {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ length: 200 })
  name!: string

  @Column({ length: 200, nullable: true })
  business?: string

  @Column({ length: 50 })
  phone!: string

  @Column({ length: 300, nullable: true })
  email?: string

  @Column({ length: 120, nullable: true })
  city?: string

  @Column({ length: 120, nullable: true })
  topic?: string

  @Column({ type: 'text' })
  message!: string

  @Column({ default: false })
  consent!: boolean

  @Column({ type: 'varchar', length: 5, default: 'fr' })
  locale!: string

  @Column({ length: 500, nullable: true })
  user_agent?: string

  @Column({
    type: 'enum',
    enum: ['NEW', 'CONTACTED', 'CLOSED'],
    default: 'NEW',
  })
  status!: 'NEW' | 'CONTACTED' | 'CLOSED'

  @Column({ type: 'text', nullable: true })
  notes?: string

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
