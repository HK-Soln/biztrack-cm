import { PaymentMethod } from '@biztrack/types'
import type {
  RestockChargeLineInput,
  RestockDiscountLineInput,
  RestockItemInput,
  RestockPaymentLineInput,
} from '@shared/ipc'

// Shared money + input model for the Receive Stock wizard, used by every step and the final
// submit so the totals shown, the credit computed, and the payload sent can never disagree.

export const num = (s: string): number => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)
export const round2 = (n: number): number => Math.round(n * 100) / 100
export const newId = (): string => crypto.randomUUID()

export const TENDERS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.MTN_MOMO,
  PaymentMethod.ORANGE_MONEY,
  PaymentMethod.CARD,
]
export const isMomo = (m: PaymentMethod): boolean =>
  m === PaymentMethod.MTN_MOMO || m === PaymentMethod.ORANGE_MONEY

export interface ChargeRow {
  id: string
  chargeTypeId: string | null
  name: string
  rateType: 'PERCENT' | 'FIXED'
  value: string
}
export interface DiscountRow {
  id: string
  description: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: string
}
export interface PaymentRow {
  id: string
  method: PaymentMethod
  amount: string
  momoRef: string
}

export const chargeAmt = (c: ChargeRow, subtotal: number): number =>
  round2(c.rateType === 'PERCENT' ? subtotal * (num(c.value) / 100) : num(c.value))
export const discAmt = (d: DiscountRow, subtotal: number): number =>
  round2(d.discountType === 'PERCENTAGE' ? subtotal * (num(d.value) / 100) : num(d.value))

export interface ReceiveTotals {
  chargesAmount: number
  discountAmount: number
  total: number
  paid: number
  balance: number
  credit: number
  overpaid: number
}

export function computeTotals(
  subtotal: number,
  charges: ChargeRow[],
  discounts: DiscountRow[],
  payments: PaymentRow[],
): ReceiveTotals {
  const chargesAmount = round2(charges.reduce((s, c) => s + chargeAmt(c, subtotal), 0))
  const discountAmount = round2(discounts.reduce((s, d) => s + discAmt(d, subtotal), 0))
  const total = round2(Math.max(0, subtotal - discountAmount + chargesAmount))
  const paid = round2(payments.reduce((s, p) => s + num(p.amount), 0))
  const balance = round2(total - paid)
  return {
    chargesAmount,
    discountAmount,
    total,
    paid,
    balance,
    credit: Math.max(0, balance),
    overpaid: Math.max(0, -balance),
  }
}

/** Build the payload for `dataClient.inventory.restock` from the wizard state. */
export function buildRestockInput(args: {
  purchaseOrderId: string | null
  supplierId: string | null
  reference: string
  items: RestockItemInput[]
  subtotal: number
  charges: ChargeRow[]
  discounts: DiscountRow[]
  payments: PaymentRow[]
  invoiceNumber: string
  invoiceDate: string
  invoiceFileUrl: string | null
  fallbackChargeName: string
  fallbackDiscountName: string
}) {
  const chargeLines: RestockChargeLineInput[] = args.charges.map((c) => ({
    id: c.id,
    chargeTypeId: c.chargeTypeId,
    name: c.name.trim() || args.fallbackChargeName,
    rateType: c.rateType,
    rateValue: num(c.value),
    amount: chargeAmt(c, args.subtotal),
  }))
  const discountLines: RestockDiscountLineInput[] = args.discounts.map((d) => ({
    id: d.id,
    description: d.description.trim() || args.fallbackDiscountName,
    discountType: d.discountType,
    rate: d.discountType === 'PERCENTAGE' ? num(d.value) : null,
    amount: discAmt(d, args.subtotal),
  }))
  const paymentLines: RestockPaymentLineInput[] = args.payments
    .filter((p) => num(p.amount) > 0)
    .map((p) => ({
      method: p.method,
      amount: num(p.amount),
      mobileMoneyReference: isMomo(p.method) ? p.momoRef.trim() || null : null,
    }))
  return {
    purchaseOrderId: args.purchaseOrderId,
    supplierId: args.supplierId,
    reference: args.reference.trim() || null,
    items: args.items,
    charges: chargeLines,
    discounts: discountLines,
    payments: paymentLines,
    invoiceNumber: args.invoiceNumber.trim() || null,
    invoiceDate: args.invoiceDate || null,
    invoiceFileUrl: args.invoiceFileUrl,
  }
}
