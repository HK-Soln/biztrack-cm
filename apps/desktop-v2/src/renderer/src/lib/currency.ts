import { useMemo } from 'react'
import { useSessionStore } from '@/stores/session.store'
import { useLangStore } from '@/i18n'

/**
 * Money formatting for the active business currency (dynamic per business —
 * XAF, NGN, USD, …) using the active app language as the locale. Intl picks the
 * correct fraction digits per currency (XAF→0, USD→2). Use this everywhere money
 * is shown — never hardcode XAF/FCFA.
 *
 * NOTE: subscription/plan pricing is the platform's billing currency (XAF) and is
 * intentionally NOT formatted with this hook.
 */
export function useCurrency() {
  const currency = useSessionStore((s) => s.status.businessCurrency) || 'XAF'
  const lang = useLangStore((s) => s.lang)

  return useMemo(() => {
    const nf = new Intl.NumberFormat(lang, { style: 'currency', currency })
    const plain = new Intl.NumberFormat(lang)
    // The currency symbol/code as this locale renders it (e.g. "FCFA", "₦", "$").
    const symbol = nf.formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency

    /** Full currency string, e.g. "6 500 FCFA". `—` for null/undefined. */
    const format = (n: number | null | undefined): string => (n == null ? '—' : nf.format(n))

    /** Abbreviated for KPI chips: "1.2M FCFA", "15K FCFA", else grouped + symbol. */
    const compact = (n: number): string => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${symbol}`
      if (n >= 10_000) return `${Math.round(n / 1000)}K ${symbol}`
      return `${plain.format(n)} ${symbol}`
    }

    return { currency, symbol, format, compact, plain: (n: number) => plain.format(n) }
  }, [currency, lang])
}
