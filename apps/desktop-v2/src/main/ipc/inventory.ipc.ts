import { ipcMain } from 'electron'
import {
  IPC,
  type AdjustStockInput,
  type InventoryListQuery,
  type MovementsQuery,
  type RestockInput,
  type ThresholdInput,
} from '../../shared/ipc'
import type { InventoryService } from '../services/inventory.service'

export function registerInventoryIpc(inventory: InventoryService): void {
  ipcMain.handle(IPC.inventoryList, (_e, query?: InventoryListQuery) => inventory.list(query))
  ipcMain.handle(IPC.inventoryStats, () => inventory.stats())
  ipcMain.handle(IPC.inventoryReorderSuggestions, () => inventory.reorderSuggestions())
  ipcMain.handle(IPC.inventoryRestock, (_e, input: RestockInput) => inventory.restock(input))
  ipcMain.handle(IPC.inventoryAdjust, (_e, productId: string, input: AdjustStockInput) => inventory.adjust(productId, input))
  ipcMain.handle(IPC.inventorySetThreshold, (_e, productId: string, input: ThresholdInput) =>
    inventory.setThreshold(productId, input),
  )
  ipcMain.handle(IPC.inventoryListMovements, (_e, productId: string, query?: MovementsQuery) =>
    inventory.listMovements(productId, query),
  )
}
