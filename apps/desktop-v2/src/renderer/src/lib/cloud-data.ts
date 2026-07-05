import type {
  // roles
  RolesListQuery,
  ListRolesResponse,
  ListPermissionsResponse,
  RoleWithPermissions,
  CreateRoleRequest,
  UpdateRoleRequest,
  // team
  ListTeamMembersResponse,
  UpdateMemberRoleResponse,
  RemoveTeamMemberResponse,
  UpdateMemberStatusResponse,
  ListPendingInvitesResponse,
  SendInviteRequest,
  SendInviteResponse,
  ResendInviteResponse,
  CancelInviteResponse,
  // notifications
  ListNotificationsQuery,
  ListNotificationsResponse,
  UnreadCountResponse,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  // invitations
  ListMyInvitationsResponse,
  AcceptInvitationResponse,
  RejectInvitationResponse,
  // business
  BusinessProfile,
  UpdateBusinessRequest,
  // plans
  ListPlansResponse,
  CurrentSubscriptionResponse,
  QuotaUsageResponse,
  CancelPlanResponse,
  // online
  OnlineStore,
  CreateOnlineStoreRequest,
  UpdateOnlineStoreRequest,
  OnlineOrdersQuery,
  OnlineOrderListResult,
  OnlineOrderDetail,
  OnlineOrder,
  OnlineSlugCheck,
  UpdateOrderStatusRequest,
  // uploads
  UploadFileInput,
  UploadedFile,
} from '@shared/ipc'
import type { BusinessMembershipSummary } from '@biztrack/types'
import { cget, cpost, cpatch, cput, cdelete } from './cloud-http'
import { fetchCloudSession } from './cloud-auth'

/**
 * Cloud (browser) implementations for the ONLINE-ONLY DataClient domains — the ones
 * whose main-process service already talks to apps/api over HTTP (auth, business,
 * plans, roles, team, notifications, invitations, online, uploads). Each method
 * mirrors the matching `src/main/services/<domain>.service.ts` route.
 *
 * Offline-first domains (products, contacts, inventory, sales, …) are NOT here: the
 * API has no CRUD REST surface for them (they flow through sync), so they stay
 * notWired in the cloud adapter.
 */

export const cloudRoles = {
  list: (query: RolesListQuery = {}) => {
    const params = new URLSearchParams()
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    if (query.search) params.set('search', query.search)
    const qs = params.toString()
    return cget<ListRolesResponse>(`/roles${qs ? `?${qs}` : ''}`)
  },
  permissions: () => cget<ListPermissionsResponse>('/roles/permissions'),
  get: (id: string) => cget<RoleWithPermissions>(`/roles/${id}`),
  create: (input: CreateRoleRequest) => cpost<RoleWithPermissions>('/roles', input),
  update: (id: string, input: UpdateRoleRequest) =>
    cpatch<RoleWithPermissions>(`/roles/${id}`, input),
  remove: (id: string) => cdelete<{ deleted: boolean }>(`/roles/${id}`),
  setPermissions: (id: string, permissions: string[]) =>
    cput<RoleWithPermissions>(`/roles/${id}/permissions`, { permissions }),
}

export const cloudTeam = {
  listMembers: () => cget<ListTeamMembersResponse>('/businesses/members'),
  updateMemberRole: (userId: string, roleId: string) =>
    cpatch<UpdateMemberRoleResponse>(`/businesses/members/${userId}/role`, { roleId }),
  removeMember: (userId: string) =>
    cdelete<RemoveTeamMemberResponse>(`/businesses/members/${userId}`),
  setMemberActive: (userId: string, active: boolean) =>
    cpatch<UpdateMemberStatusResponse>(`/businesses/members/${userId}/status`, { active }),
  listInvites: () => cget<ListPendingInvitesResponse>('/invites'),
  sendInvite: (input: SendInviteRequest) => cpost<SendInviteResponse>('/invites', input),
  resendInvite: (id: string) => cpost<ResendInviteResponse>(`/invites/${id}/resend`, {}),
  cancelInvite: (id: string) => cdelete<CancelInviteResponse>(`/invites/${id}`),
}

export const cloudNotificationsRest = {
  list: (query: ListNotificationsQuery = {}) => {
    const params = new URLSearchParams()
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    const qs = params.toString()
    return cget<ListNotificationsResponse>(`/notifications${qs ? `?${qs}` : ''}`)
  },
  unreadCount: () => cget<UnreadCountResponse>('/notifications/unread-count'),
  markRead: (id: string) => cpatch<MarkNotificationReadResponse>(`/notifications/${id}/read`, {}),
  markAllRead: () => cpatch<MarkAllNotificationsReadResponse>('/notifications/read-all', {}),
}

export const cloudInvitations = {
  list: () => cget<ListMyInvitationsResponse>('/businesses/invitations'),
  accept: (businessId: string) =>
    cpost<AcceptInvitationResponse>(`/businesses/invitations/${businessId}/accept`, {}),
  reject: (businessId: string) =>
    cpost<RejectInvitationResponse>(`/businesses/invitations/${businessId}/reject`, {}),
}

// Structural shape covering both /businesses/mine business-summaries and the
// /businesses/setup response (which additionally carries `role`).
type BusinessFields = Partial<BusinessProfile> & { id: string; name: string; currency?: string }

function toProfile(b: BusinessFields, role: BusinessProfile['role']): BusinessProfile {
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
    role,
  }
}

export const cloudBusiness = {
  getProfile: async (): Promise<BusinessProfile | null> => {
    const session = await fetchCloudSession()
    const businessId = session.businessId
    if (!businessId) return null
    const list = await cget<BusinessMembershipSummary[]>('/businesses/mine')
    const membership = (list ?? []).find((m) => m.businessId === businessId) ?? null
    const b = membership?.business
    if (!b) return null
    return toProfile(b, membership?.role ?? null)
  },
  update: async (payload: UpdateBusinessRequest): Promise<BusinessProfile> => {
    const b = await cpost<BusinessFields & { role?: BusinessProfile['role'] }>(
      '/businesses/setup',
      payload,
    )
    return toProfile(b, b.role ?? null)
  },
}

export const cloudPlans = {
  list: () => cget<ListPlansResponse>('/plans'),
  subscription: () => cget<CurrentSubscriptionResponse>('/plans/my-subscription'),
  quotaUsage: () => cget<QuotaUsageResponse>('/plans/quota-usage'),
  upgrade: async (plan: string) => {
    await cpost('/plans/upgrade', { plan })
  },
  cancel: () => cpost<CancelPlanResponse>('/plans/cancel', {}),
}

export const cloudOnline = {
  getStore: () => cget<OnlineStore | null>('/online-store'),
  createStore: (input: CreateOnlineStoreRequest) => cpost<OnlineStore>('/online-store', input),
  updateStore: (input: UpdateOnlineStoreRequest) => cpatch<OnlineStore>('/online-store', input),
  publishStore: () => cpost<OnlineStore>('/online-store/publish', {}),
  listOrders: (query: OnlineOrdersQuery = {}) => {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.set(k, String(v))
    })
    const qs = params.toString()
    return cget<OnlineOrderListResult>(`/online-store/orders${qs ? `?${qs}` : ''}`)
  },
  getOrder: (id: string) => cget<OnlineOrderDetail>(`/online-store/orders/${id}`),
  updateOrderStatus: (id: string, input: UpdateOrderStatusRequest) =>
    cpatch<OnlineOrder>(`/online-store/orders/${id}/status`, input),
  checkSlug: (slug: string) =>
    cget<OnlineSlugCheck>(`/online-store/slug-check?slug=${encodeURIComponent(slug)}`),
}

export const cloudUploads = {
  file: (input: UploadFileInput): Promise<UploadedFile> => {
    const form = new FormData()
    const blob = new Blob([input.bytes], { type: input.contentType || 'application/octet-stream' })
    form.append('file', blob, input.filename || 'upload')
    const query = input.folder ? `?folder=${encodeURIComponent(input.folder)}` : ''
    return cpost<UploadedFile>(`/uploads${query}`, form)
  },
}
