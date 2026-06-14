'use client'

import { api } from './api'
import type {
  OnlineOrderDetail,
  OnlineOrderListResult,
  OnlineOrderStatus,
  UpdateOrderStatusRequest,
} from '@biztrack/types'
import { type ApiEnvelope, unwrapApiResponse } from './api-response'

// Online orders live server-side only (they originate from the public storefront
// and are not part of the offline SQLite mirror). These call the API directly,
// so the screen requires an internet connection.

export interface ListOnlineOrdersQuery {
  status?: OnlineOrderStatus
  page?: number
  limit?: number
}

export async function listOnlineOrders(
  query: ListOnlineOrdersQuery = {},
): Promise<OnlineOrderListResult> {
  const { data } = await api.get<ApiEnvelope<OnlineOrderListResult>>('/online-store/orders', {
    params: {
      status: query.status,
      page: query.page,
      limit: query.limit,
    },
  })
  return unwrapApiResponse<OnlineOrderListResult>(data)
}

export async function getOnlineOrder(id: string): Promise<OnlineOrderDetail> {
  const { data } = await api.get<ApiEnvelope<OnlineOrderDetail>>(`/online-store/orders/${id}`)
  return unwrapApiResponse<OnlineOrderDetail>(data)
}

export async function updateOnlineOrderStatus(
  id: string,
  payload: UpdateOrderStatusRequest,
): Promise<OnlineOrderDetail> {
  const { data } = await api.patch<ApiEnvelope<OnlineOrderDetail>>(
    `/online-store/orders/${id}/status`,
    payload,
  )
  return unwrapApiResponse<OnlineOrderDetail>(data)
}
