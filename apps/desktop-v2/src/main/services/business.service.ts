import type { HttpClient } from '@biztrack/http-client'
import type {
  BusinessMembershipSummary,
  BusinessProfile,
  UpdateBusinessRequest,
} from '@biztrack/types'
import type { LocalCache } from './local-cache'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * Desktop proxy for the business-profile API. The business record is server-owned
 * (not part of the offline sync set), so this runs in main and calls the API via
 * authHttp (phase2 token attached + auto-refreshed; never reaches the renderer).
 * Read = GET /businesses/mine (the active membership's business summary); write =
 * POST /businesses/setup (the API's update path — flips ONBOARDING → PLAN_PENDING,
 * otherwise keeps status; OWNER-only). After a successful save we refresh the local
 * offline cache so the sidebar/topbar business name updates without a re-login.
 */
export class BusinessService {
  constructor(
    private readonly http: HttpClient,
    private readonly getBusinessId: () => string | null,
    private readonly getUserId: () => string | null,
    private readonly cache: LocalCache,
  ) {}

  async getProfile(): Promise<BusinessProfile | null> {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const res = await this.http.get<ApiEnvelope<BusinessMembershipSummary[]>>('/businesses/mine')
    const list = res.data.data ?? []
    const membership = list.find((m) => m.businessId === businessId) ?? null
    const b = membership?.business
    if (!b) return null
    return {
      id: b.id,
      name: b.name,
      type: b.type ?? null,
      description: b.description ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      address: b.address ?? null,
      city: b.city ?? null,
      currency: b.currency ?? 'XAF',
      logoUrl: b.logoUrl ?? null,
      role: membership?.role ?? null,
    }
  }

  async update(payload: UpdateBusinessRequest): Promise<BusinessProfile> {
    const res = await this.http.post<ApiEnvelope<BusinessProfile & { currency?: string }>>(
      '/businesses/setup',
      payload,
    )
    const b = res.data.data
    // Keep the offline cache (which backs the sidebar/topbar name) in step.
    const userId = this.getUserId()
    if (userId && b?.id) {
      this.cache.saveBusinesses(userId, [{ id: b.id, name: b.name, currency: b.currency ?? 'XAF' }])
    }
    return {
      id: b.id,
      name: b.name,
      type: b.type ?? null,
      description: b.description ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      address: b.address ?? null,
      city: b.city ?? null,
      currency: b.currency ?? 'XAF',
      logoUrl: b.logoUrl ?? null,
      role: b.role ?? null,
    }
  }
}
