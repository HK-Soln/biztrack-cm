import { ipcMain } from 'electron'
import { IPC, type UnitInput, type UnitListQuery } from '../../shared/ipc'
import type { UnitsService } from '../services/units.service'

export function registerUnitsIpc(units: UnitsService): void {
  ipcMain.handle(IPC.unitsList, (_e, query?: UnitListQuery) => units.list(query))
  ipcMain.handle(IPC.unitsCreate, (_e, input: UnitInput) => units.create(input))
  ipcMain.handle(IPC.unitsUpdate, (_e, id: string, input: UnitInput) => units.update(id, input))
  ipcMain.handle(IPC.unitsDelete, (_e, id: string) => units.remove(id))
}
