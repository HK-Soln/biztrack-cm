import { ipcMain } from 'electron'
import type { ReviewFlagsQuery } from '@biztrack/types'
import { IPC } from '../../shared/ipc'
import type { ReviewFlagsService } from '../services/review-flags.service'

export function registerReviewFlagsIpc(reviewFlags: ReviewFlagsService): void {
  ipcMain.handle(IPC.reviewFlagsList, (_e, query?: ReviewFlagsQuery) => reviewFlags.list(query))
  ipcMain.handle(IPC.reviewFlagsCount, () => reviewFlags.count())
  ipcMain.handle(IPC.reviewFlagsResolve, (_e, id: string, note?: string) =>
    reviewFlags.resolve(id, note),
  )
}
