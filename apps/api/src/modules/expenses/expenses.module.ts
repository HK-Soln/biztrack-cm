import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { ExpenseCategory } from '@/entities/expense-category.entity'
import { Expense } from '@/entities/expense.entity'
import { MonthlyExpenseSummary } from '@/entities/monthly-expense-summary.entity'
import { ExpenseCategoriesController } from './controllers/expense-categories.controller'
import { ExpensesController } from './controllers/expenses.controller'
import { ExpenseCategoriesService } from './services/expense-categories.service'
import { ExpensesService } from './services/expenses.service'
import { MonthlyExpenseSummaryService } from './services/monthly-expense-summary.service'
import { PermissionsModule } from '../permissions/permissions.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Expense,
      ExpenseCategory,
      MonthlyExpenseSummary,
      DailySaleSummary,
    ]),
    PermissionsModule,
  ],
  controllers: [ExpenseCategoriesController, ExpensesController],
  providers: [ExpenseCategoriesService, MonthlyExpenseSummaryService, ExpensesService],
  exports: [ExpenseCategoriesService, MonthlyExpenseSummaryService, ExpensesService],
})
export class ExpensesModule {}
