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
  type InitiateInStorePaymentRequest,
  type InStorePaymentInitiated,
  type InStorePaymentStatus,
  type CreatePaymentLinkRequest,
  type PaymentLinkView,
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
  // In-store provider payments (Spec 07 §7 / Build 10) — start a MoMo push / card link at the till
  // and poll it. Authed cashier context; proxied through the same authHttp client.
  ipcMain.handle(
    IPC.paymentsInitiateInStore,
    async (_e, input: InitiateInStorePaymentRequest) =>
      (await http.post<ApiEnvelope<InStorePaymentInitiated>>('/payments/in-store/initiate', input))
        .data.data,
  )
  ipcMain.handle(
    IPC.paymentsInStoreStatus,
    async (_e, attemptId: string) =>
      (
        await http.get<ApiEnvelope<InStorePaymentStatus>>(
          `/payments/in-store/${encodeURIComponent(attemptId)}/status`,
        )
      ).data.data,
  )
  ipcMain.handle(
    IPC.paymentsConfirmInStore,
    async (_e, attemptId: string) =>
      (
        await http.post<ApiEnvelope<InStorePaymentStatus>>(
          `/payments/in-store/${encodeURIComponent(attemptId)}/confirm`,
          {},
        )
      ).data.data,
  )
  ipcMain.handle(
    IPC.paymentsFailInStore,
    async (_e, attemptId: string) =>
      (
        await http.post<ApiEnvelope<InStorePaymentStatus>>(
          `/payments/in-store/${encodeURIComponent(attemptId)}/fail`,
          {},
        )
      ).data.data,
  )
  // Spec 08 — payment links (authed, merchant-facing).
  ipcMain.handle(
    IPC.paymentLinksCreate,
    async (_e, input: CreatePaymentLinkRequest) =>
      (await http.post<ApiEnvelope<PaymentLinkView>>('/payment-links', input)).data.data,
  )
  ipcMain.handle(
    IPC.paymentLinksList,
    async () => (await http.get<ApiEnvelope<PaymentLinkView[]>>('/payment-links')).data.data,
  )
  ipcMain.handle(
    IPC.paymentLinksCancel,
    async (_e, id: string) =>
      (
        await http.post<ApiEnvelope<void>>(
          `/payment-links/${encodeURIComponent(id)}/cancel`,
          {},
        )
      ).data.data,
  )
  ipcMain.handle(
    IPC.paymentLinksFinalize,
    async (_e, id: string) =>
      (
        await http.post<ApiEnvelope<PaymentLinkView>>(
          `/payment-links/${encodeURIComponent(id)}/finalize`,
          {},
        )
      ).data.data,
  )
}
