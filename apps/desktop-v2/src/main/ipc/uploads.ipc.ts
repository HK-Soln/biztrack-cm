import { ipcMain } from 'electron'
import { IPC, type UploadFileInput } from '../../shared/ipc'
import type { UploadService } from '../services/upload.service'

export function registerUploadsIpc(uploads: UploadService): void {
  ipcMain.handle(IPC.uploadsFile, (_e, input: UploadFileInput) => uploads.upload(input))
}
