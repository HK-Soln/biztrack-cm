import type {
  AvailablePaymentMethod,
  BusinessPaymentProviderView,
  BusinessPaymentRouteView,
  ConfigureWebhookRequest,
  ConnectPaymentProviderRequest,
  ConnectPaymentProviderResponse,
  InitiateInStorePaymentRequest,
  InStorePaymentInitiated,
  InStorePaymentStatus,
  CreatePaymentLinkRequest,
  CreateSaleDraftLinkRequest,
  PaymentLinkView,
  PaymentProvider,
  PaymentProviderCapability,
  SetPaymentRouteRequest,
} from '@shared/ipc'
import { cdelete, cget, cpost, cput } from './cloud-http'

/** Payment provider registry in the cloud/browser build (Spec 07) — owner-only, straight to the API. */
export const cloudPayments = {
  listProviders: (): Promise<PaymentProvider[]> => cget('/payments/providers'),
  listCapabilities: (country?: string): Promise<PaymentProviderCapability[]> =>
    cget(`/payments/capabilities${country ? `?country=${encodeURIComponent(country)}` : ''}`),
  listConnections: (): Promise<BusinessPaymentProviderView[]> => cget('/payments/connections'),
  connect: (input: ConnectPaymentProviderRequest): Promise<ConnectPaymentProviderResponse> =>
    cpost('/payments/connections', input),
  configureWebhook: (
    id: string,
    input: ConfigureWebhookRequest,
  ): Promise<BusinessPaymentProviderView> => cpost(`/payments/connections/${id}/webhook`, input),
  verify: (id: string): Promise<BusinessPaymentProviderView> =>
    cpost(`/payments/connections/${id}/verify`, {}),
  revoke: (id: string): Promise<BusinessPaymentProviderView> =>
    cdelete(`/payments/connections/${id}`),
  listRoutes: (): Promise<BusinessPaymentRouteView[]> => cget('/payments/routes'),
  setRoute: (input: SetPaymentRouteRequest): Promise<BusinessPaymentRouteView> =>
    cput('/payments/routes', input),
  removeRoute: (id: string): Promise<{ success: true }> => cdelete(`/payments/routes/${id}`),
  availableMethods: (): Promise<AvailablePaymentMethod[]> => cget('/payments/available-methods'),
  initiateInStore: (input: InitiateInStorePaymentRequest): Promise<InStorePaymentInitiated> =>
    cpost('/payments/in-store/initiate', input),
  getInStoreStatus: (attemptId: string): Promise<InStorePaymentStatus> =>
    cget(`/payments/in-store/${encodeURIComponent(attemptId)}/status`),
  confirmInStore: (attemptId: string): Promise<InStorePaymentStatus> =>
    cpost(`/payments/in-store/${encodeURIComponent(attemptId)}/confirm`, {}),
  failInStore: (attemptId: string): Promise<InStorePaymentStatus> =>
    cpost(`/payments/in-store/${encodeURIComponent(attemptId)}/fail`, {}),
  createLink: (input: CreatePaymentLinkRequest): Promise<PaymentLinkView> =>
    cpost('/payment-links', input),
  createSaleDraftLink: (input: CreateSaleDraftLinkRequest): Promise<PaymentLinkView> =>
    cpost('/payment-links/sale-draft', input),
  listLinks: (): Promise<PaymentLinkView[]> => cget('/payment-links'),
  cancelLink: (id: string): Promise<void> =>
    cpost(`/payment-links/${encodeURIComponent(id)}/cancel`, {}),
  finalizeLink: (id: string): Promise<PaymentLinkView> =>
    cpost(`/payment-links/${encodeURIComponent(id)}/finalize`, {}),
}
