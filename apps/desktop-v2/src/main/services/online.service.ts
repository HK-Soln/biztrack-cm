import type { HttpClient } from '@biztrack/http-client'
import type {
  CreateOnlineStoreRequest,
  OnlineAdminProduct,
  OnlineAdminProductsQuery,
  OnlineOrder,
  OnlineOrderDetail,
  OnlineOrderListResult,
  OnlineOrderStatus,
  OnlineStore,
  OnlineStorePublicationSummary,
  PaginatedResult,
  UpdateOnlineStoreRequest,
  UpdateOrderPaymentRequest,
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

  /** Map a 403 / plan denial to a tagged message that survives IPC, so the renderer
   * can show the upgrade screen. Other errors propagate as-is (offline, server, etc.). */
  private async run<T>(thunk: () => Promise<T>): Promise<T> {
    try {
      return await thunk()
    } catch (e) {
      const err = e as {
        status?: number
        response?: { status?: number; data?: { error?: { code?: string } } }
      }
      const status = err?.status ?? err?.response?.status
      const code = err?.response?.data?.error?.code
      if (status === 403 || code === 'PLAN_UPGRADE_REQUIRED')
        throw new Error('PLAN_UPGRADE_REQUIRED')
      throw e
    }
  }

  // ---- store config ----
  getStore(): Promise<OnlineStore | null> {
    return this.run(
      async () => (await this.http.get<ApiEnvelope<OnlineStore | null>>('/online-store')).data.data,
    )
  }

  createStore(input: CreateOnlineStoreRequest): Promise<OnlineStore> {
    return this.run(
      async () =>
        (await this.http.post<ApiEnvelope<OnlineStore>>('/online-store', input)).data.data,
    )
  }

  updateStore(input: UpdateOnlineStoreRequest): Promise<OnlineStore> {
    return this.run(
      async () =>
        (await this.http.patch<ApiEnvelope<OnlineStore>>('/online-store', input)).data.data,
    )
  }

  publishStore(): Promise<OnlineStore> {
    return this.run(
      async () =>
        (await this.http.post<ApiEnvelope<OnlineStore>>('/online-store/publish', {})).data.data,
    )
  }

  listPublications(): Promise<OnlineStorePublicationSummary[]> {
    return this.run(
      async () =>
        (
          await this.http.get<ApiEnvelope<OnlineStorePublicationSummary[]>>(
            '/online-store/publications',
          )
        ).data.data,
    )
  }

  restorePublication(version: number): Promise<OnlineStore> {
    return this.run(
      async () =>
        (
          await this.http.post<ApiEnvelope<OnlineStore>>(
            `/online-store/publications/${version}/restore`,
            {},
          )
        ).data.data,
    )
  }

  checkSlug(
    slug: string,
  ): Promise<{ slug: string; available: boolean; reason?: 'invalid' | 'reserved' | 'taken' }> {
    return this.run(
      async () =>
        (
          await this.http.get<
            ApiEnvelope<{
              slug: string
              available: boolean
              reason?: 'invalid' | 'reserved' | 'taken'
            }>
          >(`/online-store/slug-check?slug=${encodeURIComponent(slug)}`)
        ).data.data,
    )
  }

  // ---- orders ----
  listOrders(query: OnlineOrdersQuery = {}): Promise<OnlineOrderListResult> {
    const params = new URLSearchParams()
    if (query.status) params.set('status', query.status)
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    const qs = params.toString()
    return this.run(
      async () =>
        (
          await this.http.get<ApiEnvelope<OnlineOrderListResult>>(
            `/online-store/orders${qs ? `?${qs}` : ''}`,
          )
        ).data.data,
    )
  }

  getOrder(id: string): Promise<OnlineOrderDetail> {
    return this.run(
      async () =>
        (await this.http.get<ApiEnvelope<OnlineOrderDetail>>(`/online-store/orders/${id}`)).data
          .data,
    )
  }

  updateOrderStatus(id: string, input: UpdateOrderStatusRequest): Promise<OnlineOrder> {
    return this.run(
      async () =>
        (
          await this.http.patch<ApiEnvelope<OnlineOrder>>(
            `/online-store/orders/${id}/status`,
            input,
          )
        ).data.data,
    )
  }

  updateOrderPayment(id: string, input: UpdateOrderPaymentRequest): Promise<OnlineOrderDetail> {
    return this.run(
      async () =>
        (
          await this.http.patch<ApiEnvelope<OnlineOrderDetail>>(
            `/online-store/orders/${id}/payment`,
            input,
          )
        ).data.data,
    )
  }

  // ---- products (publish management) ----
  listProducts(query: OnlineAdminProductsQuery = {}): Promise<PaginatedResult<OnlineAdminProduct>> {
    const params = new URLSearchParams()
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    if (query.search) params.set('search', query.search)
    if (query.published !== undefined) params.set('published', String(query.published))
    const qs = params.toString()
    return this.run(
      async () =>
        (
          await this.http.get<ApiEnvelope<PaginatedResult<OnlineAdminProduct>>>(
            `/online-store/products${qs ? `?${qs}` : ''}`,
          )
        ).data.data,
    )
  }

  /** Publish/unpublish a product — a direct store write (the API enforces publishability). */
  async setProductPublished(id: string, published: boolean): Promise<void> {
    await this.run(
      async () =>
        (
          await this.http.patch<ApiEnvelope<unknown>>(`/online-store/products/${id}`, {
            isPublishedOnline: published,
          })
        ).data.data,
    )
  }
}
