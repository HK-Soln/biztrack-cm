'use client'

import { createHttpClient } from '@biztrack/http-client/browser'

// Client → BFF only. Same-origin (relative baseURL): the renderer talks to the
// Next server's /api/* route handlers, never to the NestJS API or IPC for data.
const client = createHttpClient({ baseURL: '' })

export interface HealthResponse {
  ok: boolean
  productCount: number
  skeletonValue: string | null
  source: string
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await client.get<HealthResponse>('/api/health')
  return res.data
}
