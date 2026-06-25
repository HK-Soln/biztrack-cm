import { withAuth } from 'next-auth/middleware'

// Protect the dashboard routes. Unauthenticated users are redirected to /login
// (matching authOptions.pages.signIn). Public routes (/, /login, /api/auth) are
// intentionally excluded by the matcher below.
export default withAuth({
  pages: { signIn: '/login' },
})

export const config = {
  matcher: ['/overview/:path*', '/dashboard/:path*'],
}
