export enum Locale {
  EN = 'en',
  FR = 'fr',
}

export const DEFAULT_LOCALE =
  process.env.NODE_ENV === 'production' ? Locale.FR : Locale.EN

export const SUPPORTED_LOCALES = [Locale.EN, Locale.FR]
