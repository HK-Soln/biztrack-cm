// Cash sessions for the cloud/browser build (BIZ-2). The desktop keeps an offline till in local
// SQLite and syncs it up; the browser build talks straight to the same REST endpoints. Device-local
// orphan recovery (staleOpen/recover) has no meaning online — the server marks abandoned shifts via
// a cron — so those degrade to no-ops here.
import type {
  CashSession,
  CashMovement,
  CashSessionExpectedCash,
  CashShiftReportData,
  CashDailyReportData,
  CashVarianceHistory,
  CashReportKind,
  CloseCashSessionInput,
  SetCashVarianceReasonInput,
  RecordCashMovementInput,
  CashVarianceHistoryQuery,
  CashDailyReportQuery,
  CashSessionsListQuery,
  OpenCashSessionInput,
  TransitionCashSessionInput,
  PaginatedResult,
} from '@shared/ipc'
import { cget, cpost, cpatch } from './cloud-http'

const qs = (params: Record<string, string | number | undefined | null>): string => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

export const cloudCashSessions = {
  list: (query?: CashSessionsListQuery): Promise<PaginatedResult<CashSession>> =>
    cget(`/cash-sessions${qs({ page: query?.page, limit: query?.limit, status: query?.status })}`),
  get: (id: string): Promise<CashSession | null> =>
    cget<CashSession | null>(`/cash-sessions/${id}`),
  current: (): Promise<CashSession | null> => cget<CashSession | null>('/cash-sessions/current'),
  open: (input?: OpenCashSessionInput): Promise<CashSession> =>
    cpost('/cash-sessions', { id: input?.id, openingFloat: input?.openingFloat }),
  transition: (id: string, input: TransitionCashSessionInput): Promise<CashSession> =>
    cpatch(`/cash-sessions/${id}/status`, input),
  expectedCash: (id: string): Promise<CashSessionExpectedCash | null> =>
    cget<CashSessionExpectedCash | null>(`/cash-sessions/${id}/expected-cash`),
  recordMovement: async (input: RecordCashMovementInput): Promise<CashMovement> => {
    // The movement lands against the caller's OPEN shift (mirrors the desktop, which resolves the
    // current session itself — the input carries no sessionId).
    const current = await cget<CashSession | null>('/cash-sessions/current')
    if (!current) throw new Error('No open cash session')
    return cpost(`/cash-sessions/${current.id}/movements`, input)
  },
  listMovements: (sessionId: string): Promise<CashMovement[]> =>
    cget<CashMovement[]>(`/cash-sessions/${sessionId}/movements`),
  close: (id: string, input: CloseCashSessionInput): Promise<CashSession> =>
    cpost(`/cash-sessions/${id}/close`, input),
  setVarianceReason: (id: string, input: SetCashVarianceReasonInput): Promise<CashSession> =>
    cpost(`/cash-sessions/${id}/variance-reason`, input),
  varianceHistory: (query?: CashVarianceHistoryQuery): Promise<CashVarianceHistory> =>
    cget(`/cash-sessions/variance-history${qs({ days: query?.days })}`),
  shiftReport: (id: string, kind?: CashReportKind): Promise<CashShiftReportData | null> =>
    cget<CashShiftReportData | null>(`/cash-sessions/${id}/report${qs({ kind })}`),
  dailyReport: (query?: CashDailyReportQuery): Promise<CashDailyReportData> =>
    cget(`/cash-sessions/daily-report${qs({ fromIso: query?.fromIso, toIso: query?.toIso })}`),
  roleTracksDrawer: (): Promise<boolean> => cget<boolean>('/cash-sessions/role-tracks-drawer'),
  // Device-local orphan recovery is not applicable online (the server cron marks ABANDONED).
  staleOpen: async (): Promise<CashSession | null> => null,
  recover: (): Promise<CashSession> =>
    Promise.reject(new Error('Shift recovery is not available in the cloud build')),
}
