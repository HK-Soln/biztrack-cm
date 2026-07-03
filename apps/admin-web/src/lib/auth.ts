import type { NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { AdminProfile, AdminTokens } from './types'

const ADMIN_API_URL = process.env.ADMIN_API_URL ?? 'http://localhost:3002'

// Refresh slightly before the 1h access-token TTL elapses.
const ACCESS_TOKEN_LIFETIME_MS = 55 * 60 * 1000

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/v1/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    })
    const json = await res.json()
    if (!res.ok || !json?.success) throw new Error('refresh_failed')

    const tokens: AdminTokens = json.data.tokens
    const admin: AdminProfile = json.data.admin
    return {
      ...token,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpires: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
      admin,
      error: undefined,
    }
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Admin credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null
        const res = await fetch(`${ADMIN_API_URL}/api/v1/admin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.success) return null

        const admin: AdminProfile = json.data.admin
        const tokens: AdminTokens = json.data.tokens
        return { id: admin.id, name: admin.name, email: admin.email, admin, tokens }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          accessToken: user.tokens.accessToken,
          refreshToken: user.tokens.refreshToken,
          accessTokenExpires: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
          admin: user.admin,
        }
      }
      if (Date.now() < token.accessTokenExpires) return token
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken
      session.admin = token.admin
      session.error = token.error
      return session
    },
  },
}
