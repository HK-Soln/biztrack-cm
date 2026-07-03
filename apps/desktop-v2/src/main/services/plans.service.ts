import type { HttpClient } from '@biztrack/http-client'
import type {
  CancelPlanResponse,
  CurrentSubscriptionResponse,
  ListPlansResponse,
  QuotaUsageResponse,
} from '@biztrack/types'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * Desktop proxy for the plans/subscription API (Settings → Subscription). Subscription
 * is a business-level, server-owned concern (online-only, not in the offline sync set),
 * so this runs in main and calls the API via authHttp (phase2 token attached + auto
 * refreshed; never reaches the renderer). The cloud build calls the same API directly.
 */
export class PlansService {
  constructor(private readonly http: HttpClient) {}

  async listPlans(): Promise<ListPlansResponse> {
    return (await this.http.get<ApiEnvelope<ListPlansResponse>>('/plans')).data.data
  }

  async mySubscription(): Promise<CurrentSubscriptionResponse> {
    return (await this.http.get<ApiEnvelope<CurrentSubscriptionResponse>>('/plans/my-subscription')).data.data
  }

  async quotaUsage(): Promise<QuotaUsageResponse> {
    return (await this.http.get<ApiEnvelope<QuotaUsageResponse>>('/plans/quota-usage')).data.data
  }

  /** Upgrade or downgrade the active business plan. The renderer refetches
   * subscription/usage + refreshes the session afterwards. */
  async upgrade(plan: string): Promise<void> {
    await this.http.post<ApiEnvelope<unknown>>('/plans/upgrade', { plan })
  }

  async cancel(): Promise<CancelPlanResponse> {
    return (await this.http.post<ApiEnvelope<CancelPlanResponse>>('/plans/cancel', {})).data.data
  }
}
