import { redirect } from 'next/navigation'
import { getCachedSession } from '@/lib/permissions/server'
import type { AdminSession } from '@/types/admin'

export class AdminApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

interface AdminFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  params?: Record<string, string | undefined>
  body?: unknown
  session?: AdminSession
  signal?: AbortSignal
  /** Number of additional attempts on network errors and 5xx/408 responses. Default 0. */
  retries?: number
}

const RETRYABLE_STATUS = (status: number) => status >= 500 || status === 408

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

export async function adminFetch<T>(path: string, options: AdminFetchOptions = {}): Promise<T> {
  const { retries = 0, signal } = options

  const session = options.session ?? (await getCachedSession())?.admin
  if (!session?.accessToken) {
    redirect('/login')
  }

  const url = new URL(`${process.env.ADMIN_API_URL}${path}`)
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'Accept-Language': 'en',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    signal,
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response
    try {
      res = await fetch(url.toString(), init)
    } catch (err) {
      // AbortError must propagate immediately — never retry a cancelled request.
      if ((err as Error)?.name === 'AbortError') throw err
      if (attempt < retries) {
        await delay(2 ** attempt * 200)
        continue
      }
      throw err
    }

    if (res.status === 401) {
      redirect('/login')
    }

    if (!res.ok) {
      if (RETRYABLE_STATUS(res.status) && attempt < retries) {
        await delay(2 ** attempt * 200)
        continue
      }
      let errorData: { message?: string; code?: string } = {}
      try {
        errorData = await res.json()
      } catch {
        // response wasn't JSON
      }
      throw new AdminApiError(
        errorData.message ?? `Request failed: ${res.status}`,
        errorData.code ?? 'UNKNOWN_ERROR',
        res.status,
      )
    }

    return res.json() as Promise<T>
  }

  // Loop above always either returns or throws; this is just to satisfy the type checker.
  throw new AdminApiError('adminFetch: retries exhausted', 'RETRIES_EXHAUSTED', 0)
}
