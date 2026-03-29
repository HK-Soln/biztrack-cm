import {
  Entity,
  Column,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { User } from './user.entity'
import { Product } from './product.entity'
import { ProductCategory } from './product-category.entity'
import { Sale } from './sale.entity'
import { Expense } from './expense.entity'
import { StockMovement } from './stock-movement.entity'
import { SyncLog } from './sync-log.entity'

@Entity('businesses')
@Index('unq_businesses_slug', ['slug'], { unique: true })
@Index('unq_businesses_owner_id', ['ownerId'], { unique: true })
export class Business extends BaseEntity {
  @Column()
  name!: string

  @Column()
  slug!: string

  @Column({ nullable: true })
  description!: string 

  @Column({ nullable: true })
  phone!: string 

  @Column({ nullable: true })
  email!: string 

  @Column({ nullable: true })
  address!: string 

  @Column({ nullable: true })
  city?: string 

  @Column({ default: 'CM' })
  country!: string

  @Column({ default: 'XAF' })
  currency!: string

  @Column({ name: 'logo_url', nullable: true })
  logoUrl!: string 

  @Column({ name: 'owner_id' })
  ownerId!: string

  @OneToOne(() => User, (user) => user.ownedBusiness)
  @JoinColumn({ name: 'owner_id', foreignKeyConstraintName: 'fk_businesses_owner_id' })
  owner?: User

  @OneToMany(() => User, (user) => user.business)
  members?: User[]

  @Column({ name: 'subscription_plan', default: 'FREE' })
  subscriptionPlan!: string

  @Column({ name: 'subscription_status', default: 'TRIAL' })
  subscriptionStatus!: string

  @Column({ name: 'subscription_expires_at', nullable: true, transformer: dateTransformer })
  subscriptionExpiresAt?: Date 

  @OneToMany(() => Product, (product) => product.business)
  products?: Product[]

  @OneToMany(() => ProductCategory, (category) => category.business)
  productCategories?: ProductCategory[]

  @OneToMany(() => Sale, (sale) => sale.business)
  sales?: Sale[]

  @OneToMany(() => Expense, (expense) => expense.business)
  expenses?: Expense[]

  @OneToMany(() => StockMovement, (movement) => movement.business)
  stockMovements?: StockMovement[]

  @OneToMany(() => SyncLog, (log) => log.business)
  syncLogs?: SyncLog[]
}
