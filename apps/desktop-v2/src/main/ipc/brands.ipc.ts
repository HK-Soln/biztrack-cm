import { ipcMain } from 'electron'
import { IPC, type BrandInput, type ModelInput } from '../../shared/ipc'
import type { BrandsService } from '../services/brands.service'

export function registerBrandsIpc(brands: BrandsService): void {
  ipcMain.handle(IPC.brandsList, () => brands.list())
  ipcMain.handle(IPC.brandsCreate, (_e, input: BrandInput) => brands.create(input))
  ipcMain.handle(IPC.brandsUpdate, (_e, id: string, input: BrandInput) => brands.update(id, input))
  ipcMain.handle(IPC.brandsDelete, (_e, id: string) => brands.remove(id))
  ipcMain.handle(IPC.brandsAddModel, (_e, brandId: string, input: ModelInput) => brands.addModel(brandId, input))
  ipcMain.handle(IPC.brandsUpdateModel, (_e, modelId: string, input: ModelInput) => brands.updateModel(modelId, input))
  ipcMain.handle(IPC.brandsDeleteModel, (_e, modelId: string) => brands.removeModel(modelId))
}
