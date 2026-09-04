import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import en from './messages/en.json'
import fr from './messages/fr.json'

export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'fr'

// Static imports (NOT a dynamic `import(`./messages/${locale}.json`)`) — a dynamic template-literal
// import becomes a webpack context module that caches in `.next` and doesn't reliably reflect newly
// added message keys in dev. Importing both files directly makes each a tracked dependency, so
// Fast Refresh always picks up edits.
const MESSAGES: Record<Locale, typeof en> = { en, fr }

function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

/**
 * Resolve the active locale WITHOUT URL routing — the storefront already uses the
 * path/subdomain for the store slug, so language lives in the `NEXT_LOCALE` cookie
 * (set by the LocaleSwitcher). Falls back to the Accept-Language header, then French
 * (this is a Cameroonian product — FR is the default, not EN).
 */
async function resolveLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value
  if (isLocale(cookieLocale)) return cookieLocale

  const accept = (await headers()).get('accept-language')?.toLowerCase() ?? ''
  return accept.startsWith('en') ? 'en' : DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  return { locale, messages: MESSAGES[locale] }
})
