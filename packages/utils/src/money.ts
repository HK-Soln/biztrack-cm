// Spec 07 §3 — currency-aware money. The payments layer carries amounts in a currency's MINOR units
// (integer) plus an ISO-4217 currency; conversion to the decimal ledger (major units) happens here,
// keyed on the currency's exponent. Never assume XAF.

/** ISO-4217 currencies with ZERO minor units (minor == major). Everything else defaults to 2. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

/** Number of minor-unit decimal places for a currency (XAF = 0, AED = 2, most = 2). */
export function currencyExponent(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2
}

/** Minor units (integer) → major units (the decimal the sales ledger stores). e.g. AED 1050 → 10.5. */
export function minorToMajor(amountMinor: number, currency: string): number {
  const exp = currencyExponent(currency)
  return exp === 0 ? Math.round(amountMinor) : Math.round(amountMinor) / 10 ** exp
}

/** Major units → minor units (integer). e.g. AED 10.5 → 1050, XAF 5000 → 5000. */
export function majorToMinor(amountMajor: number, currency: string): number {
  const exp = currencyExponent(currency)
  return exp === 0 ? Math.round(amountMajor) : Math.round(amountMajor * 10 ** exp)
}
