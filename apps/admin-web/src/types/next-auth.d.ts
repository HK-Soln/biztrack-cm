import type { AdminSession } from '@/types/admin'

declare module 'next-auth' {
  interface Session {
    admin: AdminSession
  }

  interface User extends AdminSession {}
}

declare module 'next-auth/jwt' {
  interface JWT extends AdminSession {}
}
