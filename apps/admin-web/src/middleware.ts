import { withAuth } from 'next-auth/middleware'

// Protect the dashboard routes. Unauthenticated users are redirected to /login
// (matching authOptions.pages.signIn). Public routes (/, /login, /api/auth) are
// intentionally excluded by the matcher below.
export default withAuth({
  pages: { signIn: '/login' },
})

// Protect everything except the login page, next-auth endpoints, and Next internals.
// The `(dashboard)` route group is not part of the URL, so dashboard pages live at
// /overview, /roles, /team, … — a denylist matcher covers them all (incl. future pages).
export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
}
