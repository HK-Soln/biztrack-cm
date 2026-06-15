import { ipcMain } from 'electron'
import { IPC, type ProductImageInput, type ProductInput, type ProductListQuery } from '../../shared/ipc'
import type { ProductsService } from '../services/products.service'

export function registerProductsIpc(products: ProductsService): void {
  ipcMain.handle(IPC.productsList, (_e, query?: ProductListQuery) => products.list(query))
  ipcMain.handle(IPC.productsGet, (_e, id: string) => products.get(id))
  ipcMain.handle(IPC.productsCreate, (_e, input: ProductInput) => products.create(input))
  ipcMain.handle(IPC.productsUpdate, (_e, id: string, input: ProductInput) => products.update(id, input))
  ipcMain.handle(IPC.productsDelete, (_e, id: string) => products.remove(id))
  ipcMain.handle(IPC.productsListImages, (_e, productId: string) => products.listImages(productId))
  ipcMain.handle(IPC.productsSetImages, (_e, productId: string, images: ProductImageInput[]) =>
    products.setImages(productId, images),
  )
}
