import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * Someone who has ordered from the storefront (ruling R20). Not a contact: recognised on a
 * later order by phone or email (@biztrack/domain findOnlineCustomer), and linked to a
 * contact only when the shop adds them to its contacts.
 */
@Entity('online_customers')
@Index('idx_online_customers_business', ['businessId', 'lastOrderAt'])
@Index('idx_online_customers_phone', ['businessId', 'phone'])
@Index('idx_online_customers_email', ['businessId', 'email'])
export class OnlineCustomer {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  /** The name on their latest order. */
  @Column({ length: 200 })
  name!: string

  /** International form (onlineBuyerKeys). */
  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string | null

  /** Lower case (onlineBuyerKeys). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  email?: string | null

  @Column({ name: 'order_count', type: 'int', default: 0 })
  orderCount!: number

  @Column({ name: 'first_order_at', type: 'timestamptz' })
  firstOrderAt!: Date

  @Column({ name: 'last_order_at', type: 'timestamptz' })
  lastOrderAt!: Date

  /** The contact the shop made of them, if any. */
  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId?: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
