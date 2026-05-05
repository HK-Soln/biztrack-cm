import type { AdminSession } from '@/types/admin'

// Stand-in for the admin-api while the backend is being implemented.
// Replace `dummyLogin` / `dummyRefresh` call-sites in `lib/auth.ts`
// with real fetch calls to `${ADMIN_API_URL}/admin/auth/...` once it ships.

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export const DUMMY_CREDENTIALS = {
  email: 'admin@biztrack.cm',
  password: 'admin123',
} as const

const DUMMY_ADMIN: Omit<AdminSession, 'accessToken' | 'refreshToken' | 'expiresAt'> = {
  id: 'admin-001',
  name: 'Demo Super Admin',
  email: DUMMY_CREDENTIALS.email,
  role: 'super_admin',
  isSuperAdmin: true,
  permissions: [],
  scopes: {},
}

function buildTokens(now = Date.now()) {
  return {
    accessToken: `dummy-access-${now}`,
    refreshToken: `dummy-refresh-${now}`,
    expiresAt: now + TOKEN_TTL_MS,
  }
}

export function dummyLogin(email: string, password: string) {
  if (email !== DUMMY_CREDENTIALS.email || password !== DUMMY_CREDENTIALS.password) {
    return null
  }
  return { admin: DUMMY_ADMIN, tokens: buildTokens() }
}

export function dummyRefresh() {
  return { tokens: buildTokens() }
}
