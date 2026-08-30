import { ipcMain } from 'electron'
import type { HttpClient } from '@biztrack/http-client'
import {
  IPC,
  type IssueCardRequest,
  type IssueCardResponse,
  type MemberAuthCredential,
  type ReplaceCardRequest,
} from '../../shared/ipc'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * BIZ-3.3 — authorization cards are owner-only and server-owned, so these IPC handlers proxy
 * straight to the API. The issued token comes back once (for the QR); only its hash is stored.
 */
export function registerCredentialsIpc(http: HttpClient): void {
  ipcMain.handle(
    IPC.credentialsList,
    async () => (await http.get<ApiEnvelope<MemberAuthCredential[]>>('/credentials')).data.data,
  )
  ipcMain.handle(
    IPC.credentialsIssueCard,
    async (_e, input: IssueCardRequest) =>
      (await http.post<ApiEnvelope<IssueCardResponse>>('/credentials/cards', input)).data.data,
  )
  ipcMain.handle(
    IPC.credentialsRevoke,
    async (_e, id: string) =>
      (await http.post<ApiEnvelope<MemberAuthCredential>>(`/credentials/${id}/revoke`, {})).data
        .data,
  )
  ipcMain.handle(
    IPC.credentialsReplace,
    async (_e, id: string, input: ReplaceCardRequest) =>
      (await http.post<ApiEnvelope<IssueCardResponse>>(`/credentials/${id}/replace`, input)).data
        .data,
  )
}
