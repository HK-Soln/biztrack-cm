import 'next-auth'
import 'next-auth/jwt'
import type { AdminProfile, AdminTokens } from '@/lib/types'

declare module 'next-auth' {
  interface Session {
    accessToken: string
    admin: AdminProfile
    error?: string
  }

  interface User {
    admin: AdminProfile
    tokens: AdminTokens
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string
    refreshToken: string
    accessTokenExpires: number
    admin: AdminProfile
    error?: string
  }
}
