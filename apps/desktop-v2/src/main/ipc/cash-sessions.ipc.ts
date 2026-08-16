import { ipcMain } from 'electron'
import type { CloseCashSessionInput, RecordCashMovementInput } from '@biztrack/types'
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
  ipcMain.handle(IPC.cashSessionsExpectedCash, (_e, id: string) => cashSessions.expectedCash(id))
  ipcMain.handle(IPC.cashSessionsRecordMovement, (_e, input: RecordCashMovementInput) =>
    cashSessions.recordMovement(input),
  )
  ipcMain.handle(IPC.cashSessionsListMovements, (_e, sessionId: string) =>
    cashSessions.listMovements(sessionId),
  )
  ipcMain.handle(IPC.cashSessionsClose, (_e, id: string, input: CloseCashSessionInput) =>
    cashSessions.closeSession(id, input),
  )
  ipcMain.handle(IPC.cashSessionsRoleTracksDrawer, () => cashSessions.roleTracksCashDrawer())
  ipcMain.handle(IPC.cashSessionsStaleOpen, () => cashSessions.findStaleOpenSession())
  ipcMain.handle(IPC.cashSessionsRecover, (_e, id: string) => cashSessions.recoverAndClose(id))
}
