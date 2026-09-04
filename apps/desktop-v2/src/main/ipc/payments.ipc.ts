import { ipcMain } from 'electron'
import type { HttpClient } from '@biztrack/http-client'
import {
  IPC,
  type AvailablePaymentMethod,
  type BusinessPaymentProviderView,
  type BusinessPaymentRouteView,
  type ConfigureWebhookRequest,
  type ConnectPaymentProviderRequest,
  type ConnectPaymentProviderResponse,
  type PaymentProvider,
  type PaymentProviderCapability,
  type SetPaymentRouteRequest,
} from '../../shared/ipc'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * Spec 07 — payment provider registry is owner-only and server-owned, so these IPC handlers proxy
 * straight to the API (credentials never touch the renderer; the API is write-only for them).
 */
export function registerPaymentsIpc(http: HttpClient): void {
  ipcMain.handle(
    IPC.paymentsProviders,
    async () => (await http.get<ApiEnvelope<PaymentProvider[]>>('/payments/providers')).data.data,
  )
  ipcMain.handle(
    IPC.paymentsCapabilities,
    async (_e, country?: string) =>
      (
        await http.get<ApiEnvelope<PaymentProviderCapability[]>>(
          `/payments/capabilities${country ? `?country=${encodeURIComponent(country)}` : ''}`,
        )
      ).data.data,
  )
  ipcMain.handle(
    IPC.paymentsConnections,
    async () =>
      (await http.get<ApiEnvelope<BusinessPaymentProviderView[]>>('/payments/connections')).data
        .data,
  )
  ipcMain.handle(
    IPC.paymentsConnect,
    async (_e, input: ConnectPaymentProviderRequest) =>
      (await http.post<ApiEnvelope<ConnectPaymentProviderResponse>>('/payments/connections', input))
        .data.data,
  )
  ipcMain.handle(
    IPC.paymentsConfigureWebhook,
    async (_e, id: string, input: ConfigureWebhookRequest) =>
      (
        await http.post<ApiEnvelope<BusinessPaymentProviderView>>(
          `/payments/connections/${id}/webhook`,
          input,
        )
      ).data.data,
  )
  ipcMain.handle(
    IPC.paymentsVerify,
    async (_e, id: string) =>
      (
        await http.post<ApiEnvelope<BusinessPaymentProviderView>>(
          `/payments/connections/${id}/verify`,
          {},
        )
      ).data.data,
  )
  ipcMain.handle(
    IPC.paymentsRevoke,
    async (_e, id: string) =>
      (await http.delete<ApiEnvelope<BusinessPaymentProviderView>>(`/payments/connections/${id}`))
        .data.data,
  )
  ipcMain.handle(
    IPC.paymentsRoutes,
    async () =>
      (await http.get<ApiEnvelope<BusinessPaymentRouteView[]>>('/payments/routes')).data.data,
  )
  ipcMain.handle(
    IPC.paymentsSetRoute,
    async (_e, input: SetPaymentRouteRequest) =>
      (await http.put<ApiEnvelope<BusinessPaymentRouteView>>('/payments/routes', input)).data.data,
  )
  ipcMain.handle(
    IPC.paymentsRemoveRoute,
    async (_e, id: string) =>
      (await http.delete<ApiEnvelope<{ success: true }>>(`/payments/routes/${id}`)).data.data,
  )
  ipcMain.handle(
    IPC.paymentsAvailable,
    async () =>
      (await http.get<ApiEnvelope<AvailablePaymentMethod[]>>('/payments/available-methods')).data
        .data,
  )
}
