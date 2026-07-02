import { ipcMain } from 'electron'
import type { CreateRoleRequest, UpdateRoleRequest } from '@biztrack/types'
import { IPC, type RolesListQuery } from '../../shared/ipc'
import type { RolesService } from '../services/roles.service'

export function registerRolesIpc(roles: RolesService): void {
  ipcMain.handle(IPC.rolesList, (_e, query?: RolesListQuery) => roles.list(query))
  ipcMain.handle(IPC.rolesPermissions, () => roles.listPermissions())
  ipcMain.handle(IPC.rolesGet, (_e, id: string) => roles.get(id))
  ipcMain.handle(IPC.rolesCreate, (_e, input: CreateRoleRequest) => roles.create(input))
  ipcMain.handle(IPC.rolesUpdate, (_e, id: string, input: UpdateRoleRequest) => roles.update(id, input))
  ipcMain.handle(IPC.rolesRemove, (_e, id: string) => roles.remove(id))
  ipcMain.handle(IPC.rolesSetPermissions, (_e, id: string, permissions: string[]) => roles.setPermissions(id, permissions))
}
