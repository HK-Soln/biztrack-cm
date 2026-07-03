import { ipcMain } from 'electron'
import type { SendInviteRequest } from '@biztrack/types'
import { IPC } from '../../shared/ipc'
import type { TeamService } from '../services/team.service'

export function registerTeamIpc(team: TeamService): void {
  ipcMain.handle(IPC.teamListMembers, () => team.listMembers())
  ipcMain.handle(IPC.teamUpdateMemberRole, (_e, userId: string, roleId: string) => team.updateMemberRole(userId, roleId))
  ipcMain.handle(IPC.teamRemoveMember, (_e, userId: string) => team.removeMember(userId))
  ipcMain.handle(IPC.teamSetMemberStatus, (_e, userId: string, active: boolean) => team.setMemberActive(userId, active))
  ipcMain.handle(IPC.teamListInvites, () => team.listInvites())
  ipcMain.handle(IPC.teamSendInvite, (_e, input: SendInviteRequest) => team.sendInvite(input))
  ipcMain.handle(IPC.teamResendInvite, (_e, id: string) => team.resendInvite(id))
  ipcMain.handle(IPC.teamCancelInvite, (_e, id: string) => team.cancelInvite(id))
}
