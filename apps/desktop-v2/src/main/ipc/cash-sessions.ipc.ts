import { ipcMain } from 'electron'
import {
  IPC,
  type CashSessionsListQuery,
  type OpenCashSessionInput,
  type TransitionCashSessionInput,
} from '../../shared/ipc'
import type { CashSessionsService } from '../services/cash-sessions.service'

export function registerCashSessionsIpc(cashSessions: CashSessionsService): void {
  ipcMain.handle(IPC.cashSessionsList, (_e, query?: CashSessionsListQuery) =>
    cashSessions.list(query),
  )
  ipcMain.handle(IPC.cashSessionsGet, (_e, id: string) => cashSessions.get(id))
  ipcMain.handle(IPC.cashSessionsCurrent, () => cashSessions.getCurrent())
  ipcMain.handle(IPC.cashSessionsOpen, (_e, input?: OpenCashSessionInput) =>
    cashSessions.openSession(input),
  )
  ipcMain.handle(IPC.cashSessionsTransition, (_e, id: string, input: TransitionCashSessionInput) =>
    cashSessions.transition(id, input),
  )
}
