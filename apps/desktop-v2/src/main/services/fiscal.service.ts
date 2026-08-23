import type { HttpClient } from '@biztrack/http-client'
import type { AccountingPeriod, FiscalYearWithPeriods, PostingAdjustment } from '@biztrack/types'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * BIZ-5.2/5.3 — desktop proxy for the fiscal calendar + period close. Server-owned, online-only,
 * proxied through main via authHttp (tokens never reach the renderer). Reading the calendar +
 * closing/locking periods are all API operations; the resulting status changes sync back down.
 */
export class FiscalService {
  constructor(private readonly http: HttpClient) {}

  async calendar(): Promise<FiscalYearWithPeriods[]> {
    return (await this.http.get<ApiEnvelope<FiscalYearWithPeriods[]>>('/fiscal/calendar')).data.data
  }

  async adjustments(): Promise<PostingAdjustment[]> {
    return (await this.http.get<ApiEnvelope<PostingAdjustment[]>>('/fiscal/adjustments')).data.data
  }

  async closePeriod(id: string): Promise<AccountingPeriod> {
    return (await this.http.post<ApiEnvelope<AccountingPeriod>>(`/fiscal/periods/${id}/close`, {}))
      .data.data
  }

  async lockPeriod(id: string): Promise<AccountingPeriod> {
    return (await this.http.post<ApiEnvelope<AccountingPeriod>>(`/fiscal/periods/${id}/lock`, {}))
      .data.data
  }
}
