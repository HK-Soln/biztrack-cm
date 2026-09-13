import { ipcMain } from 'electron'
import {
  IPC,
  type IncomeCategoryInput,
  type OtherIncomeInput,
  type OtherIncomeListQuery,
} from '../../shared/ipc'
import type { IncomeCategoriesService, IncomeService } from '../services/income.service'

export function registerIncomeIpc(income: IncomeService, categories: IncomeCategoriesService): void {
  ipcMain.handle(IPC.incomeList, (_e, query?: OtherIncomeListQuery) => income.list(query))
  ipcMain.handle(IPC.incomeGet, (_e, id: string) => income.get(id))
  ipcMain.handle(IPC.incomeSummary, (_e, query?: OtherIncomeListQuery) => income.summary(query))
  ipcMain.handle(IPC.incomeTrend, () => income.trend())
  ipcMain.handle(IPC.incomeCreate, (_e, input: OtherIncomeInput) => income.create(input))
  ipcMain.handle(IPC.incomeUpdate, (_e, id: string, input: OtherIncomeInput) => income.update(id, input))
  ipcMain.handle(IPC.incomeRemove, (_e, id: string) => income.remove(id))
  ipcMain.handle(IPC.incomeCategoriesListAll, () => categories.listAll())
  ipcMain.handle(IPC.incomeCategoriesCreate, (_e, input: IncomeCategoryInput) => categories.create(input))
}
