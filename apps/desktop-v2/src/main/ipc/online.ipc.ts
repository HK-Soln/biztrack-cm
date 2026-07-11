import { ipcMain } from 'electron'
import type {
  CreateOnlineStoreRequest,
  OnlineAdminProductsQuery,
  UpdateOnlineStoreRequest,
  UpdateOrderPaymentRequest,
  UpdateOrderStatusRequest,
} from '@biztrack/types'
import { IPC, type OnlineOrdersQuery } from '../../shared/ipc'
import type { OnlineService } from '../services/online.service'

export function registerOnlineIpc(online: OnlineService): void {
  ipcMain.handle(IPC.onlineStoreGet, () => online.getStore())
  ipcMain.handle(IPC.onlineStoreCreate, (_e, input: CreateOnlineStoreRequest) =>
    online.createStore(input),
  )
  ipcMain.handle(IPC.onlineStoreUpdate, (_e, input: UpdateOnlineStoreRequest) =>
    online.updateStore(input),
  )
  ipcMain.handle(IPC.onlineStorePublish, () => online.publishStore())
  ipcMain.handle(IPC.onlinePublicationsList, () => online.listPublications())
  ipcMain.handle(IPC.onlinePublicationRestore, (_e, version: number) =>
    online.restorePublication(version),
  )
  ipcMain.handle(IPC.onlineOrdersList, (_e, query?: OnlineOrdersQuery) => online.listOrders(query))
  ipcMain.handle(IPC.onlineOrderGet, (_e, id: string) => online.getOrder(id))
  ipcMain.handle(IPC.onlineOrderUpdateStatus, (_e, id: string, input: UpdateOrderStatusRequest) =>
    online.updateOrderStatus(id, input),
  )
  ipcMain.handle(IPC.onlineOrderUpdatePayment, (_e, id: string, input: UpdateOrderPaymentRequest) =>
    online.updateOrderPayment(id, input),
  )
  ipcMain.handle(IPC.onlineSlugCheck, (_e, slug: string) => online.checkSlug(slug))
  ipcMain.handle(IPC.onlineProductsList, (_e, query?: OnlineAdminProductsQuery) =>
    online.listProducts(query),
  )
  ipcMain.handle(IPC.onlineProductSetPublished, (_e, id: string, published: boolean) =>
    online.setProductPublished(id, published),
  )
}
