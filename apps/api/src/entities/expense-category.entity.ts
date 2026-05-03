import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { Expense } from './expense.entity'

@Entity('expense_categories')
@Index('idx_expense_categories_business_id', ['businessId'])
export class ExpenseCategory extends BaseEntity {
  @Column({ name: 'business_id', nullable: true })
  businessId!: string | null

  @ManyToOne(() => Business, (business) => business.expenseCategories, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_expense_categories_business_id' })
  business?: Business | null

  @Column({ length: 100 })
  name!: string

  @Column({ length: 110 })
  slug!: string

  @Column({ length: 7 })
  color!: string

  @Column({ length: 50, nullable: true, type: 'varchar' })
  icon?: string | null

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @OneToMany(() => Expense, (expense) => expense.category)
  expenses?: Expense[]
}
