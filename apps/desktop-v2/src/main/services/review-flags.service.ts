import type { HttpClient } from '@biztrack/http-client'
import type {
  ReviewFlag,
  ReviewFlagsCount,
  ReviewFlagsListResponse,
  ReviewFlagsQuery,
} from '@biztrack/types'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * Desktop proxy for review flags: what the server accepted from a till but the owner should
 * look at. Server-owned and online-only (the flags are raised when a sale syncs), proxied
 * through main via authHttp so tokens never reach the renderer.
 */
export class ReviewFlagsService {
  constructor(private readonly http: HttpClient) {}

  async list(query: ReviewFlagsQuery = {}): Promise<ReviewFlagsListResponse> {
    const params = new URLSearchParams()
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    if (query.status) params.set('status', query.status)
    if (query.severity) params.set('severity', query.severity)
    if (query.code) params.set('code', query.code)
    if (query.entityId) params.set('entityId', query.entityId)
    const qs = params.toString()
    return (
      await this.http.get<ApiEnvelope<ReviewFlagsListResponse>>(
        `/review-flags${qs ? `?${qs}` : ''}`,
      )
    ).data.data
  }

  async count(): Promise<ReviewFlagsCount> {
    return (await this.http.get<ApiEnvelope<ReviewFlagsCount>>('/review-flags/count')).data.data
  }

  async resolve(id: string, note?: string): Promise<ReviewFlag> {
    return (
      await this.http.post<ApiEnvelope<ReviewFlag>>(`/review-flags/${id}/resolve`, {
        ...(note?.trim() ? { note: note.trim() } : {}),
      })
    ).data.data
  }
}
