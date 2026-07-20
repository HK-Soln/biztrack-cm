import { ipcMain } from 'electron'
import {
  IPC,
  type ListQuery,
  type ProductImageInput,
  type ProductInput,
  type ProductListQuery,
  type SerialUnitInput,
  type VariantInput,
} from '../../shared/ipc'
import type { ProductsService } from '../services/products.service'

export function registerProductsIpc(products: ProductsService): void {
  ipcMain.handle(IPC.productsList, (_e, query?: ProductListQuery) => products.list(query))
  ipcMain.handle(IPC.productsStats, () => products.stats())
  ipcMain.handle(IPC.productsGet, (_e, id: string) => products.get(id))
  ipcMain.handle(IPC.productsCreate, (_e, input: ProductInput) => products.create(input))
  ipcMain.handle(IPC.productsUpdate, (_e, id: string, input: ProductInput) =>
    products.update(id, input),
  )
  ipcMain.handle(IPC.productsDelete, (_e, id: string) => products.remove(id))
  ipcMain.handle(IPC.productsListImages, (_e, productId: string) => products.listImages(productId))
  ipcMain.handle(IPC.productsSetImages, (_e, productId: string, images: ProductImageInput[]) =>
    products.setImages(productId, images),
  )
  ipcMain.handle(IPC.productsListVariants, (_e, productId: string) =>
    products.listVariants(productId),
  )
  ipcMain.handle(IPC.productsListVariantsPage, (_e, productId: string, query?: ListQuery) =>
    products.listVariantsPage(productId, query),
  )
  ipcMain.handle(IPC.productsSetVariants, (_e, productId: string, variants: VariantInput[]) =>
    products.setVariants(productId, variants),
  )
  ipcMain.handle(IPC.productsAddVariant, (_e, productId: string, input: VariantInput) =>
    products.addVariant(productId, input),
  )
  ipcMain.handle(
    IPC.productsUpdateVariant,
    (_e, productId: string, variantId: string, input: VariantInput) =>
      products.updateVariant(productId, variantId, input),
  )
  ipcMain.handle(
    IPC.productsRemoveVariant,
    (_e, productId: string, variantId: string, reason: string) =>
      products.removeVariant(productId, variantId, reason),
  )
  ipcMain.handle(IPC.productsListSerialUnits, (_e, productId: string) =>
    products.listSerialUnits(productId),
  )
  ipcMain.handle(IPC.productsListSerialUnitsPage, (_e, productId: string, query?: ListQuery) =>
    products.listSerialUnitsPage(productId, query),
  )
  ipcMain.handle(
    IPC.productsListInStockSerials,
    (_e, productId: string, variantId?: string | null, search?: string) =>
      products.listInStockSerials(productId, variantId, search),
  )
  ipcMain.handle(IPC.productsResolveScan, (_e, code: string) => products.resolveScan(code))
  ipcMain.handle(IPC.productsSetSerialUnits, (_e, productId: string, units: SerialUnitInput[]) =>
    products.setSerialUnits(productId, units),
  )
  ipcMain.handle(
    IPC.productsAddSerialUnits,
    (_e, productId: string, units: SerialUnitInput[], notes?: string | null) =>
      products.addSerialUnits(productId, units, notes ?? null),
  )
  ipcMain.handle(
    IPC.productsRetireSerialUnit,
    (_e, productId: string, unitId: string, reason: string) =>
      products.retireSerialUnit(productId, unitId, reason),
  )
  ipcMain.handle(
    IPC.productsUpdateSerialNumber,
    (_e, productId: string, unitId: string, serialNumber: string) =>
      products.updateSerialNumber(productId, unitId, serialNumber),
  )
  ipcMain.handle(IPC.productsListMovements, (_e, productId: string) =>
    products.listMovements(productId),
  )
}
