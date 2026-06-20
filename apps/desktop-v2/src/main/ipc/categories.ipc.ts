import { ipcMain } from 'electron'
import {
  IPC,
  type CategoryInput,
  type CategoryListQuery,
  type CategoryParentOptionsQuery,
  type CategorySelectableQuery,
} from '../../shared/ipc'
import type { CategoriesService } from '../services/categories.service'

export function registerCategoriesIpc(categories: CategoriesService): void {
  ipcMain.handle(IPC.categoriesList, (_e, query?: CategoryListQuery) => categories.list(query))
  ipcMain.handle(IPC.categoriesListAll, () => categories.listAll())
  ipcMain.handle(IPC.categoriesSelectable, (_e, query?: CategorySelectableQuery) => categories.listSelectable(query))
  ipcMain.handle(IPC.categoriesParentOptions, (_e, query?: CategoryParentOptionsQuery) =>
    categories.listParentOptions(query),
  )
  ipcMain.handle(IPC.categoriesCreate, (_e, input: CategoryInput) => categories.create(input))
  ipcMain.handle(IPC.categoriesUpdate, (_e, id: string, input: CategoryInput) => categories.update(id, input))
  ipcMain.handle(IPC.categoriesDelete, (_e, id: string) => categories.remove(id))
}
