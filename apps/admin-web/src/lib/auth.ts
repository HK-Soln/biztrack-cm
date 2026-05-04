import NextAuth, { type NextAuthResult } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import type { AdminSession } from '@/types/admin'
import { dummyLogin, dummyRefresh } from '@/lib/dummy-data'

// TODO: replace dummy implementations once admin-api ships.
// The real endpoints should return `{ admin, tokens: { accessToken, refreshToken, expiresAt } }`
// — this layer just trusts whatever `expiresAt` the server sends.

async function refreshAccessToken(token: AdminSession): Promise<AdminSession | null> {
  const refreshed = dummyRefresh()
  return { ...token, ...refreshed.tokens }
}

const result: NextAuthResult = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== 'string' || typeof password !== 'string') return null

        const data = dummyLogin(email, password)
        if (!data) return null

        return {
          id: data.admin.id,
          name: data.admin.name,
          email: data.admin.email,
          role: data.admin.role,
          isSuperAdmin: data.admin.isSuperAdmin,
          permissions: data.admin.permissions,
          scopes: data.admin.scopes,
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
          expiresAt: data.tokens.expiresAt,
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return { ...token, ...user }
      }

      if (Date.now() < (token.expiresAt as number)) {
        return token
      }

      const refreshed = await refreshAccessToken(token as unknown as AdminSession)
      if (refreshed) {
        return { ...token, ...refreshed }
      }

      return { ...token, error: 'RefreshAccessTokenError' }
    },

    session({ session, token }) {
      session.admin = {
        id: token.id as string,
        name: token.name as string,
        email: token.email as string,
        role: token.role as string,
        isSuperAdmin: token.isSuperAdmin as boolean,
        permissions: token.permissions as string[],
        scopes: token.scopes as Record<string, { cities?: string[]; plans?: string[] }>,
        accessToken: token.accessToken as string,
        refreshToken: token.refreshToken as string,
        expiresAt: token.expiresAt as number,
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
  },
})

export const auth: NextAuthResult['auth'] = result.auth
export const handlers: NextAuthResult['handlers'] = result.handlers
export const signIn: NextAuthResult['signIn'] = result.signIn
export const signOut: NextAuthResult['signOut'] = result.signOut
