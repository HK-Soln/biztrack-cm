const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message ?? 'Request failed')
  }
  return res.json()
}
