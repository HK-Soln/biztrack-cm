// The backend drives the flow via AuthNextStep — this maps each step to its v2
// route. Ported from v1's auth-routing, adapted to v2 paths.
const ALIASES: Record<string, string> = {
  verify_phone: 'verify_phone',
  verify_email: 'verify_email',
  password_required: 'password_required',
  confirm_login: 'confirm_login',
  otp_login: 'confirm_login',
  login_complete: 'dashboard',
  select_business: 'select_business',
  select_plan: 'select_plan',
  setup_business: 'setup_business',
  add_first_product: 'add_first_product',
  dashboard: 'dashboard',
  register: 'register',
  login: 'login',
  request_new_otp: 'request_new_otp',
}

export function normalizeNextStep(step: string | null | undefined): string {
  const key = String(step ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]/g, '_')
  return ALIASES[key] ?? 'login'
}

export function routeForNextStep(step: string | null | undefined): string {
  switch (normalizeNextStep(step)) {
    case 'select_business':
      return '/select-business'
    case 'setup_business':
      return '/setup-business'
    case 'select_plan':
      return '/select-plan'
    case 'add_first_product':
      return '/add-first-product'
    case 'dashboard':
      return '/'
    case 'register':
      return '/signup'
    case 'verify_email':
      return '/verify-email'
    // password_required / confirm_login / request_new_otp / verify_phone are handled
    // inline by the sign-in, SSO and sign-up screens; fall back to the entry points.
    case 'confirm_login':
      return '/sso'
    default:
      return '/signin'
  }
}

/** True when this step means the app/dashboard is reachable. */
export function isDashboardStep(step: string | null | undefined): boolean {
  return normalizeNextStep(step) === 'dashboard'
}
