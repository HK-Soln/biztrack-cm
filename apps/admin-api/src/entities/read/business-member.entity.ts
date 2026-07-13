import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { ClientUser } from './client-user.entity'

/** Mapping onto the client-owned `business_members` table. */
@Entity('business_members')
export class BusinessMember extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Column({ name: 'role', type: 'varchar' })
  role!: string

  @Column({ name: 'status', type: 'varchar' })
  status!: string

  @ManyToOne(() => Business, (b) => b.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business?: Business

  @ManyToOne(() => ClientUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: ClientUser
}
