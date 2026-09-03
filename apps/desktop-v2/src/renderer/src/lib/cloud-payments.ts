import type {
  AvailablePaymentMethod,
  BusinessPaymentProviderView,
  BusinessPaymentRouteView,
  ConnectPaymentProviderRequest,
  ConnectPaymentProviderResponse,
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
  verify: (id: string): Promise<BusinessPaymentProviderView> =>
    cpost(`/payments/connections/${id}/verify`, {}),
  revoke: (id: string): Promise<BusinessPaymentProviderView> =>
    cdelete(`/payments/connections/${id}`),
  listRoutes: (): Promise<BusinessPaymentRouteView[]> => cget('/payments/routes'),
  setRoute: (input: SetPaymentRouteRequest): Promise<BusinessPaymentRouteView> =>
    cput('/payments/routes', input),
  removeRoute: (id: string): Promise<{ success: true }> => cdelete(`/payments/routes/${id}`),
  availableMethods: (): Promise<AvailablePaymentMethod[]> => cget('/payments/available-methods'),
}
