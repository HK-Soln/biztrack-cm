import type { StockMovementType } from '@shared/ipc'

/** Stock-movement type → ledger pill colour (mirrors the design .et-* palette). */
export const MV_PILL: Record<StockMovementType, string> = {
  OPENING_STOCK: 'et-sale',
  RESTOCK_IN: 'et-pay',
  TRANSFER_IN: 'et-pay',
  VOID_REVERSAL: 'et-pay',
  SALE: 'et-debt',
  TRANSFER_OUT: 'et-debt',
  MANUAL_ADJUSTMENT: 'et-woff',
}

const MV_DATE = new Intl.DateTimeFormat('fr-CM', { day: 'numeric', month: 'short' })
const MV_TIME = new Intl.DateTimeFormat('fr-CM', { hour: '2-digit', minute: '2-digit' })

export const formatMovementDate = (iso: string): string => {
  const d = new Date(iso)
  return `${MV_DATE.format(d)} · ${MV_TIME.format(d)}`
}
