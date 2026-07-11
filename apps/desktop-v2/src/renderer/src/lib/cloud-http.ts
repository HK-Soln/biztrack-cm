import {
  createHttpClient,
  HttpError,
  type HttpClient,
  type RequestConfig,
  type RequestOptions,
} from '@biztrack/http-client/browser'
import { CLOUD_API_BASE_URL } from './config'

/**
 * Browser HTTP client for the cloud/online build. The renderer talks to apps/api
 * directly (no Electron IPC). Mirror of the main process's auth-http.ts, but:
 *  - the access token lives in-memory here (renderer JS), and
 *  - the refresh token is an httpOnly cookie set by the API, so refresh is a
 *    credentialed POST /auth/refresh with no token in the body.
 *
 * Only used by the cloud DataClient adapter — the Electron build never imports it.
 */

// Re-exported from the single renderer config (src/renderer/src/lib/config.ts) so existing
// importers (cloud-misc, cloud-realtime) keep working.
export { CLOUD_API_BASE_URL }

export type ApiEnvelope<T> = { success?: boolean; data: T }

/** Unwrap the API response envelope `{ success, data }`. */
export function unwrap<T>(res: { data: ApiEnvelope<T> }): T {
  return res.data.data
}

/** Skip attaching/refreshing auth — for public endpoints (preview, login, register). */
export const PUBLIC = { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } } as const

let accessToken: string | null = null
export function setAccessToken(token: string | null): void {
  accessToken = token
}
export function getAccessToken(): string | null {
  return accessToken
}
export function clearAccessToken(): void {
  accessToken = null
}

let onClearedCb: (() => void) | null = null
/** Register a callback fired when the session is cleared (refresh failed). */
export function onAuthCleared(cb: () => void): void {
  onClearedCb = cb
}

function headerVal(config: Pick<RequestConfig, 'headers'> | undefined, name: string) {
  return (config?.headers as Record<string, unknown> | undefined)?.[name]
}

export const cloudHttp: HttpClient = createHttpClient({
  baseURL: CLOUD_API_BASE_URL,
  timeout: 20_000,
  withCredentials: true, // send/receive the httpOnly refresh cookie
})

cloudHttp.interceptors.request.use((config) => {
  const headers = (config.headers ?? {}) as Record<string, string>
  config.headers = headers
  if (!headerVal(config, 'x-skip-auth') && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  headers['X-Device-Type'] = 'WEB'
  return config
})

let refreshing = false
let queue: Array<(token: string | null) => void> = []
const flush = (token: string | null) => {
  queue.forEach((cb) => cb(token))
  queue = []
}

cloudHttp.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    const err = error as { config?: RequestConfig; response?: { status?: number } }
    const original = err.config
    const url = original?.url ?? ''
    // Never try to refresh on the auth/invite calls themselves (avoids loops).
    const isAuthCall = url.includes('/auth/') || url.includes('/invites/')
    if (!original || err.response?.status !== 401 || isAuthCall) {
      return Promise.reject(error)
    }

    if (refreshing) {
      return new Promise((resolve, reject) => {
        queue.push((token) => {
          if (!token) return reject(error)
          ;(original.headers as Record<string, string>).Authorization = `Bearer ${token}`
          resolve(cloudHttp.request(original))
        })
      })
    }

    refreshing = true
    try {
      // Refresh token rides in the httpOnly cookie (withCredentials) — empty body.
      const { data } = await cloudHttp.post<ApiEnvelope<{ tokens?: { accessToken: string } }>>(
        '/auth/refresh',
        {},
        { headers: { 'x-skip-auth-refresh': '1', 'x-skip-auth': '1' } },
      )
      const next = data?.data?.tokens
      if (next?.accessToken) {
        setAccessToken(next.accessToken)
        flush(next.accessToken)
        ;(original.headers as Record<string, string>).Authorization = `Bearer ${next.accessToken}`
        return cloudHttp.request(original)
      }
      throw new Error('No tokens from refresh')
    } catch (refreshError) {
      flush(null)
      clearAccessToken()
      onClearedCb?.()
      return Promise.reject(refreshError)
    } finally {
      refreshing = false
    }
  },
)

// Typed helpers that unwrap the `{ success, data }` envelope and return `data` directly.
export async function cget<T>(url: string, opts?: RequestOptions): Promise<T> {
  return (await cloudHttp.get<ApiEnvelope<T>>(url, opts)).data.data
}
export async function cpost<T>(url: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return (await cloudHttp.post<ApiEnvelope<T>>(url, body, opts)).data.data
}
export async function cpatch<T>(url: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return (await cloudHttp.patch<ApiEnvelope<T>>(url, body, opts)).data.data
}
export async function cput<T>(url: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return (await cloudHttp.put<ApiEnvelope<T>>(url, body, opts)).data.data
}

/**
 * Fetch ALL rows of a paginated list endpoint by looping pages. The API caps `limit`
 * at 100, so "fetch everything" (pickers, listAll) must page through rather than ask
 * for a huge limit. `path` may already contain a query string.
 */
export async function cgetAll<T>(path: string, pageSize = 100): Promise<T[]> {
  const all: T[] = []
  const sep = path.includes('?') ? '&' : '?'
  for (let page = 1; page <= 200; page++) {
    const res = await cget<{ data: T[]; totalPages?: number }>(
      `${path}${sep}page=${page}&limit=${pageSize}`,
    )
    const rows = res.data ?? []
    all.push(...rows)
    if (rows.length < pageSize || (res.totalPages !== undefined && page >= res.totalPages)) break
  }
  return all
}
/** DELETE, optionally with a request body (some endpoints take a `reason` in the body). */
export async function cdelete<T>(url: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return (
    await cloudHttp.request<ApiEnvelope<T>>({ ...(opts ?? {}), url, method: 'DELETE', data: body })
  ).data.data
}

export { HttpError }
