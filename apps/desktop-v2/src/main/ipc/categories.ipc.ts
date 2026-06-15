import { ipcMain } from 'electron'
import { IPC, type CategoryInput } from '../../shared/ipc'
import type { CategoriesService } from '../services/categories.service'

export function registerCategoriesIpc(categories: CategoriesService): void {
  ipcMain.handle(IPC.categoriesList, () => categories.list())
  ipcMain.handle(IPC.categoriesCreate, (_e, input: CategoryInput) => categories.create(input))
  ipcMain.handle(IPC.categoriesUpdate, (_e, id: string, input: CategoryInput) => categories.update(id, input))
  ipcMain.handle(IPC.categoriesDelete, (_e, id: string) => categories.remove(id))
}
