import type {
  LocalContact,
  LocalContactListItem,
  ContactsSummary,
  ContactsQuery,
  PaginatedResult,
  CreateContactRequest,
  UpdateContactRequest,
} from '@shared/ipc'
import { ContactType } from '@biztrack/types'
import { cget, cgetAll, cpost, cpatch, cdelete } from './cloud-http'

/** Drop null/undefined so a payload satisfies the API's non-null optional DTO fields. */
function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out
}

/**
 * Cloud (browser) read adapter for contacts. The API's `contacts.findAll` already
 * computes the debt balances (totalReceivable/Payable/openDebts/oldestUnpaidAt) and
 * `ContactsSummary` is a shared type, so this is near-passthrough — only `idDocuments`
 * needs coalescing to `[]`.
 */

function qs(query?: Record<string, unknown>): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// The API returns a superset of LocalContactListItem (extra businessId/createdBy/…);
// idDocuments may come back null.
type ApiContact = Omit<LocalContactListItem, 'idDocuments'> & { idDocuments?: string[] | null }

function toLocalContactListItem(c: ApiContact): LocalContactListItem {
  return { ...c, idDocuments: c.idDocuments ?? [] }
}

// The desktop page sends sort/order (+ a computed `balance` sort); the API wants
// sortBy/sortOrder (uppercase) and can't sort by balance — translate + drop the rest.
function contactQuery(query?: Record<string, unknown>): Record<string, unknown> {
  if (!query) return {}
  const out: Record<string, unknown> = {}
  for (const k of ['page', 'limit', 'search', 'type', 'isActive', 'balance']) {
    const v = query[k]
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  const sortBy = query.sortBy ?? query.sort
  if (typeof sortBy === 'string' && sortBy !== 'balance') out.sortBy = sortBy // balance = API default order
  const sortOrder = (query.sortOrder ?? query.order) as string | undefined
  if (sortOrder) out.sortOrder = sortOrder.toUpperCase()
  return out
}

export const cloudContacts = {
  list: async (query?: ContactsQuery): Promise<PaginatedResult<LocalContactListItem>> => {
    const res = await cget<PaginatedResult<ApiContact>>(`/contacts${qs(contactQuery(query as Record<string, unknown>))}`)
    return { ...res, data: res.data.map(toLocalContactListItem) }
  },
  summary: (): Promise<ContactsSummary> => cget<ContactsSummary>('/contacts/summary'),
  // The API's type filter is exact, so fetch active contacts and include BOTH locally.
  listAllSuppliers: async (): Promise<LocalContact[]> =>
    (await cgetAll<ApiContact>('/contacts?isActive=true'))
      .filter((c) => c.type === ContactType.SUPPLIER || c.type === ContactType.BOTH)
      .map(toLocalContactListItem),
  listAllCustomers: async (): Promise<LocalContact[]> =>
    (await cgetAll<ApiContact>('/contacts?isActive=true'))
      .filter((c) => c.type === ContactType.CUSTOMER || c.type === ContactType.BOTH)
      .map(toLocalContactListItem),
  get: async (id: string): Promise<LocalContactListItem | null> => {
    try {
      return toLocalContactListItem(await cget<ApiContact>(`/contacts/${id}`))
    } catch {
      return null
    }
  },
  create: async (input: CreateContactRequest): Promise<LocalContact> =>
    toLocalContactListItem(await cpost<ApiContact>('/contacts', clean(input as unknown as Record<string, unknown>))),
  update: async (id: string, input: UpdateContactRequest): Promise<LocalContact> =>
    toLocalContactListItem(await cpatch<ApiContact>(`/contacts/${id}`, clean(input as unknown as Record<string, unknown>))),
  remove: (id: string): Promise<void> => cdelete<void>(`/contacts/${id}`),
}
