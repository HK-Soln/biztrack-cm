import { ipcMain } from 'electron'
import { IPC, type ExpenseCategoryInput, type ExpenseInput, type ExpensesListQuery } from '../../shared/ipc'
import type { ExpenseCategoriesService, ExpensesService } from '../services/expenses.service'

export function registerExpensesIpc(expenses: ExpensesService, categories: ExpenseCategoriesService): void {
  ipcMain.handle(IPC.expensesList, (_e, query?: ExpensesListQuery) => expenses.list(query))
  ipcMain.handle(IPC.expensesGet, (_e, id: string) => expenses.get(id))
  ipcMain.handle(IPC.expensesSummary, (_e, query?: ExpensesListQuery) => expenses.summary(query))
  ipcMain.handle(IPC.expensesTrend, () => expenses.trend())
  ipcMain.handle(IPC.expensesCreate, (_e, input: ExpenseInput) => expenses.create(input))
  ipcMain.handle(IPC.expensesUpdate, (_e, id: string, input: ExpenseInput) => expenses.update(id, input))
  ipcMain.handle(IPC.expensesSetStatus, (_e, id: string, status: string, paymentMethod?: string | null) => expenses.setStatus(id, status, paymentMethod))
  ipcMain.handle(IPC.expensesRemove, (_e, id: string) => expenses.remove(id))
  ipcMain.handle(IPC.expenseCategoriesListAll, () => categories.listAll())
  ipcMain.handle(IPC.expenseCategoriesCreate, (_e, input: ExpenseCategoryInput) => categories.create(input))
}
