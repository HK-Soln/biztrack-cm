// Shared formatting helpers for sale rows + the sale-detail drawer, so the Sales
// route and the dashboard tables render statuses / payment labels identically.
import type { useT } from '@/i18n'
import type { LocalSale } from '@shared/ipc'

export function saleStatusInfo(t: ReturnType<typeof useT>, s: Pick<LocalSale, 'status' | 'creditAmount' | 'amountPaid'>): {
  cls: string
  label: string
} {
  if (s.status === 'VOIDED') return { cls: 'st-out', label: t('sales.refunded') }
  if (s.creditAmount > 0) return { cls: 'st-low', label: s.amountPaid > 0 ? t('sales.partial') : t('sales.onCredit') }
  return { cls: 'st-ok', label: t('sales.paid') }
}

export function salePayLabel(t: ReturnType<typeof useT>, method: string | null): string {
  if (!method) return t('sell.credit')
  switch (method) {
    case 'CASH':
      return t('sell.cash')
    case 'MTN_MOMO':
      return t('sell.momo')
    case 'ORANGE_MONEY':
      return t('sell.om')
    case 'CARD':
      return t('sell.card')
    case 'SAVINGS':
      return t('sell.deposit')
    case 'MIXED':
      return t('sell.split')
    case 'CREDIT':
      return t('sell.credit')
    default:
      return method
  }
}

export function saleInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '—'
  return ((p[0]![0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase()
}

export function formatSaleTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function formatSaleDateTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}
