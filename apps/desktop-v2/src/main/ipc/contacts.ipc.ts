import { ipcMain } from 'electron'
import { IPC, type ContactsQuery, type CreateContactRequest, type UpdateContactRequest } from '../../shared/ipc'
import type { ContactsService } from '../services/contacts.service'

export function registerContactsIpc(contacts: ContactsService): void {
  ipcMain.handle(IPC.contactsList, (_e, query?: ContactsQuery) => contacts.list(query))
  ipcMain.handle(IPC.contactsSummary, () => contacts.summary())
  ipcMain.handle(IPC.contactsListAllSuppliers, () => contacts.listAllSuppliers())
  ipcMain.handle(IPC.contactsListAllCustomers, () => contacts.listAllCustomers())
  ipcMain.handle(IPC.contactsGet, (_e, id: string) => contacts.get(id))
  ipcMain.handle(IPC.contactsCreate, (_e, input: CreateContactRequest) => contacts.create(input))
  ipcMain.handle(IPC.contactsUpdate, (_e, id: string, input: UpdateContactRequest) => contacts.update(id, input))
  ipcMain.handle(IPC.contactsDelete, (_e, id: string) => contacts.remove(id))
}
