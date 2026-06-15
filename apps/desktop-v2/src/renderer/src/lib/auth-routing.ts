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
  // No forced add-first-product step — once the plan is chosen the business is
  // active; first-product guidance is a (future) dismissible dashboard nudge.
  add_first_product: 'dashboard',
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
    case 'dashboard':
      return '/'
    case 'register':
      return '/signup'
    // Phone/email verification UI lives inside the sign-up screen (handled inline
    // there); a returning user is never asked to verify on login (the API errors
    // instead). Route to /signup defensively rather than a non-existent route.
    case 'verify_phone':
    case 'verify_email':
      return '/signup'
    // OTP / passwordless steps are owned by the SSO screen.
    case 'confirm_login':
    case 'request_new_otp':
      return '/sso'
    // password_required, login and anything unrecognized → the password sign-in.
    case 'password_required':
    case 'login':
    default:
      return '/signin'
  }
}

/** True when this step means the app/dashboard is reachable. */
export function isDashboardStep(step: string | null | undefined): boolean {
  return normalizeNextStep(step) === 'dashboard'
}
