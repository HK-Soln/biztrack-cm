import { createHttpClient, HttpError } from '@biztrack/http-client/browser'
import type {
  AddCartItemRequest,
  CategoryTreeResponse,
  CheckoutRequest,
  OnlineCart,
  PaginatedResult,
  PublicOrderTracking,
  PublicProductDetail,
  PublicProductListItem,
  PublicProductsQuery,
  PublicStore,
} from '@biztrack/types'

// The storefront uses the shared HTTP client (packages/http-client). The browser
// flavor binds globalThis.fetch, so the same client works in server components
// (SSR, where Next 15 fetches are uncached/dynamic by default) and in the browser
// (TanStack Query refetches).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const http = createHttpClient({ baseURL: API_BASE, timeout: 15_000 })

type ApiEnvelope<T> = { success?: boolean; data: T }

function unwrap<T>(body: ApiEnvelope<T> | T): T {
  return body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)
    ? (body as ApiEnvelope<T>).data
    : (body as T)
}

/** Read helper — resolves null on any error (resilient SSR reads). */
async function readJson<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T | null> {
  try {
    const res = await http.get<ApiEnvelope<T>>(path, { params })
    return unwrap(res.data)
  } catch {
    return null
  }
}

/** Mutation helper — throws a readable message on failure (surfaced by TanStack). */
async function send<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<T> {
  try {
    const res =
      method === 'POST'
        ? await http.post<ApiEnvelope<T>>(path, data)
        : method === 'PATCH'
          ? await http.patch<ApiEnvelope<T>>(path, data)
          : await http.delete<ApiEnvelope<T>>(path)
    return unwrap(res.data)
  } catch (error) {
    if (error instanceof HttpError) {
      const message = (error.response?.data as { message?: string } | undefined)?.message
      throw new Error(message ?? 'Request failed')
    }
    throw error
  }
}

const storePath = (slug: string) => `/public/stores/${encodeURIComponent(slug)}`

// ---- Reads ----------------------------------------------------------------

export function getStore(slug: string) {
  return readJson<PublicStore>(storePath(slug))
}

export function listProducts(slug: string, query: PublicProductsQuery = {}) {
  return readJson<PaginatedResult<PublicProductListItem>>(`${storePath(slug)}/products`, {
    page: query.page,
    limit: query.limit,
    categoryId: query.categoryId,
    search: query.search,
  })
}

export function getCategories(slug: string) {
  return readJson<CategoryTreeResponse>(`${storePath(slug)}/categories`)
}

/** All published product slugs for a store (paginated, capped) — used by the sitemap. */
export async function listAllProductSlugs(slug: string, cap = 1000): Promise<string[]> {
  const slugs: string[] = []
  const limit = 100
  for (let page = 1; slugs.length < cap; page++) {
    const res = await listProducts(slug, { page, limit })
    if (!res || res.data.length === 0) break
    slugs.push(...res.data.map((p) => p.slug))
    if (page >= (res.totalPages ?? 1)) break
  }
  return slugs.slice(0, cap)
}

export function getProduct(slug: string, productSlug: string) {
  return readJson<PublicProductDetail>(
    `${storePath(slug)}/products/${encodeURIComponent(productSlug)}`,
  )
}

export function getCart(slug: string, sessionToken: string) {
  return readJson<OnlineCart>(`${storePath(slug)}/cart/${encodeURIComponent(sessionToken)}`)
}

export function getOrderTracking(slug: string, trackingToken: string) {
  return readJson<PublicOrderTracking>(
    `${storePath(slug)}/orders/${encodeURIComponent(trackingToken)}`,
  )
}

// ---- Mutations ------------------------------------------------------------

export function addCartItem(slug: string, payload: AddCartItemRequest) {
  return send<OnlineCart>('POST', `${storePath(slug)}/cart/items`, payload)
}

export function updateCartItem(
  slug: string,
  sessionToken: string,
  itemKey: string,
  quantity: number,
) {
  return send<OnlineCart>(
    'PATCH',
    `${storePath(slug)}/cart/${encodeURIComponent(sessionToken)}/items/${encodeURIComponent(itemKey)}`,
    { quantity },
  )
}

export function removeCartItem(slug: string, sessionToken: string, itemKey: string) {
  return send<OnlineCart>(
    'DELETE',
    `${storePath(slug)}/cart/${encodeURIComponent(sessionToken)}/items/${encodeURIComponent(itemKey)}`,
  )
}

export function checkout(slug: string, sessionToken: string, payload: CheckoutRequest) {
  return send<{ orderNumber: string; trackingToken: string; status: string }>(
    'POST',
    `${storePath(slug)}/cart/${encodeURIComponent(sessionToken)}/checkout`,
    payload,
  )
}

// ---- Helpers --------------------------------------------------------------

export function formatMoney(amount: number, currency = 'XAF'): string {
  return `${Math.round(amount).toLocaleString('fr-FR')} ${currency}`
}

export const cartItemKey = (item: {
  productId: string
  variantId?: string | null
  serialUnitId?: string | null
}) => `${item.productId}:${item.variantId ?? ''}:${item.serialUnitId ?? ''}`
