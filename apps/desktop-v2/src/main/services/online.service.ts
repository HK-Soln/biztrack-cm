import type { HttpClient } from '@biztrack/http-client'
import type {
  CreateOnlineStoreRequest,
  OnlineOrder,
  OnlineOrderDetail,
  OnlineOrderListResult,
  OnlineOrderStatus,
  OnlineStore,
  UpdateOnlineStoreRequest,
  UpdateOrderStatusRequest,
} from '@biztrack/types'

type ApiEnvelope<T> = { success?: boolean; data: T }

export interface OnlineOrdersQuery {
  status?: OnlineOrderStatus
  page?: number
  limit?: number
}

/**
 * Desktop proxy for the online store/orders API. Online store/orders are API-only (not in
 * the offline sync set), so this runs in main and calls the API via authHttp (phase2 token
 * attached + auto-refreshed; never reaches the renderer). Offline, calls reject and the
 * renderer surfaces the error / offline state. The cloud build calls the same API directly.
 */
export class OnlineService {
  constructor(private readonly http: HttpClient) {}

  // ---- store config ----
  async getStore(): Promise<OnlineStore | null> {
    const { data } = await this.http.get<ApiEnvelope<OnlineStore | null>>('/online-store')
    return data.data
  }

  async createStore(input: CreateOnlineStoreRequest): Promise<OnlineStore> {
    const { data } = await this.http.post<ApiEnvelope<OnlineStore>>('/online-store', input)
    return data.data
  }

  async updateStore(input: UpdateOnlineStoreRequest): Promise<OnlineStore> {
    const { data } = await this.http.patch<ApiEnvelope<OnlineStore>>('/online-store', input)
    return data.data
  }

  async publishStore(): Promise<OnlineStore> {
    const { data } = await this.http.post<ApiEnvelope<OnlineStore>>('/online-store/publish', {})
    return data.data
  }

  // ---- orders ----
  async listOrders(query: OnlineOrdersQuery = {}): Promise<OnlineOrderListResult> {
    const params = new URLSearchParams()
    if (query.status) params.set('status', query.status)
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    const qs = params.toString()
    const { data } = await this.http.get<ApiEnvelope<OnlineOrderListResult>>(`/online-store/orders${qs ? `?${qs}` : ''}`)
    return data.data
  }

  async getOrder(id: string): Promise<OnlineOrderDetail> {
    const { data } = await this.http.get<ApiEnvelope<OnlineOrderDetail>>(`/online-store/orders/${id}`)
    return data.data
  }

  async updateOrderStatus(id: string, input: UpdateOrderStatusRequest): Promise<OnlineOrder> {
    const { data } = await this.http.patch<ApiEnvelope<OnlineOrder>>(`/online-store/orders/${id}/status`, input)
    return data.data
  }
}
