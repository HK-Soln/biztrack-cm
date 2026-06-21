import { ipcMain } from 'electron'
import { IPC, type OpeningBalanceInput } from '../../shared/ipc'
import type { OpeningBalancesService } from '../services/opening-balances.service'

export function registerOpeningBalancesIpc(openingBalances: OpeningBalancesService): void {
  ipcMain.handle(IPC.openingBalancesUpsert, (_e, input: OpeningBalanceInput) => openingBalances.upsert(input))
  ipcMain.handle(IPC.openingBalancesListForContact, (_e, contactId: string) => openingBalances.listForContact(contactId))
}
