import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'fr'

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
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
