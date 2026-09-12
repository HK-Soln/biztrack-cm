import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { OtherIncome } from './other-income.entity'

/**
 * Spec 10 — categories for non-trading ("other") income, mirroring ExpenseCategory. A null business_id
 * is a system/global category shared by every business (seeded: "Delivery fees", "Miscellaneous").
 */
@Entity('income_categories')
@Index('idx_income_categories_business_id', ['businessId'])
export class IncomeCategory extends BaseEntity {
  @Column({ name: 'business_id', nullable: true })
  businessId!: string | null

  @ManyToOne(() => Business, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_income_categories_business_id' })
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

  @OneToMany(() => OtherIncome, (income) => income.category)
  incomes?: OtherIncome[]
}
