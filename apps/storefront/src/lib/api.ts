import { createHttpClient, HttpError } from '@biztrack/http-client/browser'
import type {
  AddCartItemRequest,
  CategoryTreeResponse,
  CheckoutRequest,
  CityView,
  CountryView,
  RegionView,
  CheckoutResult,
  ContactMessageRequest,
  InitiatePaymentLinkRequest,
  InitiatePaymentLinkResult,
  OnlineCart,
  PaginatedResult,
  PaymentLinkPaymentStatus,
  PublicFacets,
  PublicOrderTracking,
  PublicPaymentLink,
  PublicProductDetail,
  PublicProductListItem,
  PublicProductsQuery,
  PublicStore,
} from '@biztrack/types'
import { API_BASE_URL } from './config'

// The storefront uses the shared HTTP client (packages/http-client). The browser
// flavor binds globalThis.fetch, so the same client works in server components
// (SSR, where Next 15 fetches are uncached/dynamic by default) and in the browser
// (TanStack Query refetches).
const http = createHttpClient({ baseURL: API_BASE_URL, timeout: 15_000 })

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

// On a `preview.<slug>` host the storefront reads the DRAFT config (unpublished changes) via
// `?preview=1`; the same flag makes the API reject ordering. `undefined` keeps live-store URLs clean.
const previewParam = (preview?: boolean) => (preview ? { preview: '1' as const } : {})

// ---- Geography (structured address selects, Spec 10 ③) --------------------
export async function getCountries(): Promise<CountryView[]> {
  return (await readJson<CountryView[]>('/public/geo/countries')) ?? []
}
export async function getRegions(countryIso2: string): Promise<RegionView[]> {
  if (!countryIso2) return []
  return (await readJson<RegionView[]>('/public/geo/regions', { country: countryIso2 })) ?? []
}
export async function getCities(countryIso2: string, region: string): Promise<CityView[]> {
  if (!countryIso2 || !region) return []
  return (
    (await readJson<CityView[]>('/public/geo/cities', { country: countryIso2, region })) ?? []
  )
}

// ---- Reads ----------------------------------------------------------------

/**
 * Resolve a store by slug: `null` means "no such shop" (404), and anything else that goes wrong
 * THROWS. Unlike the other reads, this one must not collapse every failure into `null` — a null
 * store sends the visitor to the marketing site, so a transient API outage would otherwise bounce
 * every customer off every perfectly good shop instead of showing them an error.
 */
export async function getStore(slug: string, preview?: boolean): Promise<PublicStore | null> {
  try {
    const res = await http.get<ApiEnvelope<PublicStore>>(storePath(slug), {
      params: previewParam(preview),
    })
    return unwrap(res.data)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null
    throw error
  }
}

const joinIds = (ids?: string[]) => (ids && ids.length ? ids.join(',') : undefined)

export function listProducts(slug: string, query: PublicProductsQuery = {}, preview?: boolean) {
  return readJson<PaginatedResult<PublicProductListItem>>(`${storePath(slug)}/products`, {
    page: query.page,
    limit: query.limit,
    categoryIds: joinIds(query.categoryIds),
    brandIds: joinIds(query.brandIds),
    modelIds: joinIds(query.modelIds),
    attributeOptionIds: joinIds(query.attributeOptionIds),
    search: query.search,
    ...previewParam(preview),
  })
}

export function getFacets(slug: string, categoryIds?: string[], preview?: boolean) {
  return readJson<PublicFacets>(`${storePath(slug)}/facets`, {
    categoryIds: joinIds(categoryIds),
    ...previewParam(preview),
  })
}

export function getCategories(slug: string, preview?: boolean) {
  return readJson<CategoryTreeResponse>(`${storePath(slug)}/categories`, previewParam(preview))
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

export function getProduct(slug: string, productSlug: string, preview?: boolean) {
  return readJson<PublicProductDetail>(
    `${storePath(slug)}/products/${encodeURIComponent(productSlug)}`,
    previewParam(preview),
  )
}

export function getCart(slug: string, sessionToken: string, preview?: boolean) {
  return readJson<OnlineCart>(
    `${storePath(slug)}/cart/${encodeURIComponent(sessionToken)}`,
    previewParam(preview),
  )
}

export function getOrderTracking(slug: string, trackingToken: string) {
  return readJson<PublicOrderTracking>(
    `${storePath(slug)}/orders/${encodeURIComponent(trackingToken)}`,
  )
}

// ---- Mutations ------------------------------------------------------------

const previewQs = (preview?: boolean) => (preview ? '?preview=1' : '')

export function addCartItem(slug: string, payload: AddCartItemRequest, preview?: boolean) {
  return send<OnlineCart>('POST', `${storePath(slug)}/cart/items${previewQs(preview)}`, payload)
}

export function updateCartItem(
  slug: string,
  sessionToken: string,
  itemKey: string,
  quantity: number,
  preview?: boolean,
) {
  return send<OnlineCart>(
    'PATCH',
    `${storePath(slug)}/cart/${encodeURIComponent(sessionToken)}/items/${encodeURIComponent(itemKey)}${previewQs(preview)}`,
    { quantity },
  )
}

export function removeCartItem(
  slug: string,
  sessionToken: string,
  itemKey: string,
  preview?: boolean,
) {
  return send<OnlineCart>(
    'DELETE',
    `${storePath(slug)}/cart/${encodeURIComponent(sessionToken)}/items/${encodeURIComponent(itemKey)}${previewQs(preview)}`,
  )
}

export function sendContactMessage(slug: string, payload: ContactMessageRequest) {
  return send<{ ok: true }>('POST', `${storePath(slug)}/contact`, payload)
}

export function checkout(
  slug: string,
  sessionToken: string,
  payload: CheckoutRequest,
  preview?: boolean,
) {
  // In preview the API rejects with ONLINE_PREVIEW_READONLY — a backstop behind the disabled button.
  const qs = preview ? '?preview=1' : ''
  return send<CheckoutResult>(
    'POST',
    `${storePath(slug)}/cart/${encodeURIComponent(sessionToken)}/checkout${qs}`,
    payload,
  )
}

// ---- Digital receipt (QR on the printed receipt → /r/<saleId>) -------------

/** Rendered receipt HTML for a sale (public; the sale id is the capability). Null on 404/error. */
export async function getReceiptHtml(saleId: string, locale?: string): Promise<string | null> {
  const res = await readJson<{ html: string }>(
    `/public/receipts/${encodeURIComponent(saleId)}`,
    locale ? { locale } : undefined,
  )
  return res?.html ?? null
}

// ---- Payment links (Spec 08) ----------------------------------------------

const payPath = (token: string) => `/public/pay/${encodeURIComponent(token)}`

/** Resolve a payment link by token (live amount, methods, status). Null on any error/404. */
export function getPaymentLink(token: string) {
  return readJson<PublicPaymentLink>(payPath(token))
}

/** Start a payment for a link (card link / MoMo push). */
export function initiateLinkPayment(token: string, body: InitiatePaymentLinkRequest) {
  return send<InitiatePaymentLinkResult>('POST', `${payPath(token)}/initiate`, body)
}

/** Poll a link payment. Null (transient error) is treated as still pending. */
export function getLinkPaymentStatus(token: string) {
  return readJson<PaymentLinkPaymentStatus>(`${payPath(token)}/status`)
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
