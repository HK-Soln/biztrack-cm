import { format, formatDistanceToNow } from 'date-fns'

/**
 * Format a number as XAF currency.
 * e.g. 125000 → "125 000 XAF"
 */
export function formatXAF(amount: number): string {
  return new Intl.NumberFormat('fr-CM', {
    style: 'currency',
    currency: 'XAF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format a date string to a readable format.
 * e.g. "2026-04-20T10:30:00Z" → "Apr 20, 2026"
 */
export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy')
}

/**
 * Format a date string to include time.
 * e.g. "2026-04-20T10:30:00Z" → "Apr 20, 2026 10:30"
 */
export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

/**
 * Format a date as relative time.
 * e.g. "2 hours ago", "3 days ago"
 */
export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

/**
 * Mask a phone number for display.
 * e.g. "+237612345678" → "+237 6•••••678"
 */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone
  const visible = 4
  return phone.slice(0, phone.length - visible).replace(/\d(?=.{3,})/g, '•') + phone.slice(-visible)
}

/**
 * Mask an email for display.
 * e.g. "john.doe@gmail.com" → "j•••••e@gmail.com"
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain || local.length <= 2) return email
  return `${local[0]}${'•'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain}`
}

/**
 * Format a percentage value.
 * e.g. 12.345 → "12.3%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}
