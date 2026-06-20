import { ipcMain } from 'electron'
import { IPC, type SaleInput, type SalesListQuery } from '../../shared/ipc'
import type { SalesService } from '../services/sales.service'
import type { SavingsService } from '../services/savings.service'

export function registerSalesIpc(sales: SalesService, savings: SavingsService): void {
  ipcMain.handle(IPC.salesCreate, (_e, input: SaleInput) => sales.createSale(input))
  ipcMain.handle(IPC.salesList, (_e, query?: SalesListQuery) => sales.list(query))
  ipcMain.handle(IPC.salesGet, (_e, id: string) => sales.get(id))
  ipcMain.handle(IPC.savingsGetForCustomer, (_e, customerId: string) => savings.getForCustomer(customerId))
}
