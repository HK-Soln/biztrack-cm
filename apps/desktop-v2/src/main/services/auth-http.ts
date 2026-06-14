import { createHttpClient, type HttpClient, type RequestConfig } from '@biztrack/http-client'
import { API_BASE_URL } from '../config'
import type { TokenStore } from './token-store'

type ApiEnvelope<T> = { success?: boolean; data: T }

function headerVal(config: Pick<RequestConfig, 'headers'> | undefined, name: string) {
  return (config?.headers as Record<string, unknown> | undefined)?.[name]
}

/**
 * Main-process HTTP client for the BFF: attaches the access token, auto-refreshes
 * on 401 (single-flight + queue), and clears the session on refresh failure.
 * Tokens come from / go to the encrypted TokenStore — never the renderer.
 */
export function createAuthHttp(tokens: TokenStore, onCleared: () => void): HttpClient {
  const http = createHttpClient({ baseURL: API_BASE_URL, timeout: 20_000 })

  http.interceptors.request.use((config) => {
    const headers = (config.headers ?? {}) as Record<string, string>
    config.headers = headers
    if (!headerVal(config, 'x-skip-auth')) {
      const access = tokens.getTokens()?.accessToken
      if (access) headers.Authorization = `Bearer ${access}`
    }
    headers['X-Device-Type'] = 'DESKTOP_APP'
    headers['X-Platform'] = process.platform
    return config
  })

  let refreshing = false
  let queue: Array<(token: string | null) => void> = []
  const flush = (token: string | null) => {
    queue.forEach((cb) => cb(token))
    queue = []
  }

  http.interceptors.response.use(
    (res) => res,
    async (error: unknown) => {
      const err = error as { config?: RequestConfig; response?: { status?: number } }
      const original = err.config
      const url = original?.url ?? ''
      const isAuthCall = url.includes('/auth/') || url.includes('/invites/')
      if (!original || err.response?.status !== 401 || isAuthCall) {
        return Promise.reject(error)
      }

      if (refreshing) {
        return new Promise((resolve, reject) => {
          queue.push((token) => {
            if (!token) return reject(error)
            ;(original.headers as Record<string, string>).Authorization = `Bearer ${token}`
            resolve(http.request(original))
          })
        })
      }

      refreshing = true
      try {
        const refreshToken = tokens.getTokens()?.refreshToken
        const { data } = await http.post<ApiEnvelope<{ tokens?: { accessToken: string; refreshToken: string } }>>(
          '/auth/refresh',
          refreshToken ? { refreshToken } : {},
          { headers: { 'x-skip-auth-refresh': '1', 'x-skip-auth': '1' } },
        )
        const next = data?.data?.tokens
        if (next) {
          tokens.setTokens(next)
          flush(next.accessToken)
          ;(original.headers as Record<string, string>).Authorization = `Bearer ${next.accessToken}`
          return http.request(original)
        }
        throw new Error('No tokens from refresh')
      } catch (refreshError) {
        flush(null)
        tokens.clearTokens()
        onCleared()
        return Promise.reject(refreshError)
      } finally {
        refreshing = false
      }
    },
  )

  return http
}
