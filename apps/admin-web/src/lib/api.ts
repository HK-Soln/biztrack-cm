'use client'

import { useSession } from 'next-auth/react'
import { useMemo } from 'react'

const BASE = (process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:3002') + '/api/v1'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
    public status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function adminFetch<T>(
  path: string,
  accessToken: string | undefined,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const err = (json?.error ?? {}) as { code?: string; details?: unknown }
    throw new ApiError(err.code ?? `HTTP_${res.status}`, json?.message ?? 'Request failed', err.details, res.status)
  }
  return json.data as T
}

/** Hook returning verb helpers bound to the current session's access token. */
export function useAdminApi() {
  const { data: session } = useSession()
  const token = session?.accessToken
  return useMemo(
    () => ({
      get: <T,>(path: string) => adminFetch<T>(path, token),
      post: <T,>(path: string, body: unknown) =>
        adminFetch<T>(path, token, { method: 'POST', body: JSON.stringify(body) }),
      patch: <T,>(path: string, body: unknown) =>
        adminFetch<T>(path, token, { method: 'PATCH', body: JSON.stringify(body) }),
      del: <T,>(path: string) => adminFetch<T>(path, token, { method: 'DELETE' }),
    }),
    [token],
  )
}
