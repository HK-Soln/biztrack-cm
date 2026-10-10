// ---------------------------------------------------------------------------
// Sale pricing — the single computation of what a checkout is worth.
//
// Every runtime (API REST, the sync applier, desktop, mobile) prices a sale through
// `priceSale`, so a line total or sale total can never differ between the till that rang
// the sale and the server that records it. Tax is not a line: prices are tax-inclusive.
// ---------------------------------------------------------------------------

import { allocateProRata, toWholeXaf } from '../money/whole-xaf'

/** Reason recorded on an OVERRIDE discount when the cashier gave none (BIZ-1.6). */
export const DEFAULT_OVERRIDE_REASON_CODE = 'NEGOTIATED'

/** Quantities carry at most three decimals (variable-quantity goods sold by weight/length). */
export function roundQuantity(quantity: number): number {
  return Math.round(quantity * 1000) / 1000
}

/**
 * Whether a charged unit price has drifted more than 10% from the catalogue's current
 * selling price — a warning signal, never a rejection. Any positive price drifts from a
 * free (zero-priced) product.
 */
export function hasPriceDrift(chargedUnitPrice: number, currentSellingPrice: number): boolean {
  if (currentSellingPrice <= 0) return chargedUnitPrice > 0
  return Math.abs(chargedUnitPrice - currentSellingPrice) / currentSellingPrice > 0.1
}

export interface SaleLinePricingInput {
  /** Units sold. The caller normalises it first (`roundQuantity`); it is used as given. */
  quantity: number
  /** The unit price the cashier actually charged. */
  unitPrice: number
  /** Catalogue price snapshot at cart-add; defaults to the charged price. */
  unitPriceListed?: number | null
  /** Explicit line discount for the whole line (not per unit). Negative is treated as 0. */
  discountAmount?: number | null
  reasonCode?: string | null
  reasonNote?: string | null
}

/** A line-scoped discount derived from pricing a line. Adapters add the display wording. */
export interface DerivedLineDiscount {
  discountType: 'OVERRIDE' | 'FIXED_AMOUNT'
  amount: number
  reasonCode: string | null
  reasonNote: string | null
}

export interface PricedSaleLine {
  quantity: number
  /** The price the line is RUNG at: the listed price when bargained down, else the charged price. */
  unitPrice: number
  unitPriceListed: number
  /** The unit price the cashier charged, before the OVERRIDE model re-rungs the line. */
  chargedUnitPrice: number
  /** Line discounts: the override gap plus any explicit line discount. */
  discountAmount: number
  /** This line's share of the cart-level discount. */
  cartDiscountAlloc: number
  /** unitPrice × quantity − discountAmount − cartDiscountAlloc, never below 0. */
  lineTotal: number
  /** Σ(amount) === discountAmount (the BIZ-1.2 invariant). */
  lineDiscounts: DerivedLineDiscount[]
}

export interface SalePricingInput {
  lines: SaleLinePricingInput[]
  /** Cart-level discount (sum of the cart discount lines). Capped at the subtotal. */
  cartDiscount?: number | null
  /** Sum of the charge lines (transport, service, payment fee…). */
  charges?: number | null
}

export interface SalePricing {
  lines: PricedSaleLine[]
  /** Σ line totals BEFORE the cart discount is allocated. */
  subtotal: number
  /** The cart-level discount actually applied (after the subtotal cap). */
  discountAmount: number
  chargesAmount: number
  /** subtotal − discountAmount + chargesAmount, never below 0. */
  totalAmount: number
}

/**
 * Price one line under the BIZ-1.2 OVERRIDE model: a line is rung at the catalogue
 * (listed) price and any bargain is a discount. When the charged price is below listed,
 * `unitPrice` becomes the listed price and the gap is folded into `discountAmount` with an
 * OVERRIDE discount, so `discountAmount` always reconciles with the line's discount rows.
 * A charged price at or above listed keeps that price (a markup) — never a negative discount.
 */
export function priceSaleLine(input: SaleLinePricingInput): PricedSaleLine {
  const quantity = input.quantity
  const chargedUnitPrice = toWholeXaf(input.unitPrice)
  const unitPriceListed = toWholeXaf(input.unitPriceListed ?? input.unitPrice)
  const explicitDiscount = toWholeXaf(Math.max(0, input.discountAmount ?? 0))
  const overrideGap =
    chargedUnitPrice < unitPriceListed
      ? toWholeXaf((unitPriceListed - chargedUnitPrice) * quantity)
      : 0
  const unitPrice = overrideGap > 0 ? unitPriceListed : chargedUnitPrice
  const discountAmount = toWholeXaf(overrideGap + explicitDiscount)

  const lineDiscounts: DerivedLineDiscount[] = []
  if (overrideGap > 0) {
    lineDiscounts.push({
      discountType: 'OVERRIDE',
      amount: overrideGap,
      reasonCode: input.reasonCode ?? DEFAULT_OVERRIDE_REASON_CODE,
      reasonNote: input.reasonNote ?? null,
    })
  }
  if (explicitDiscount > 0) {
    lineDiscounts.push({
      discountType: 'FIXED_AMOUNT',
      amount: explicitDiscount,
      reasonCode: null,
      reasonNote: null,
    })
  }

  return {
    quantity,
    unitPrice,
    unitPriceListed,
    chargedUnitPrice,
    discountAmount,
    cartDiscountAlloc: 0,
    lineTotal: Math.max(0, toWholeXaf(unitPrice * quantity - discountAmount)),
    lineDiscounts,
  }
}

/**
 * Price a whole sale: each line (OVERRIDE model), the subtotal, the cart discount capped at
 * the subtotal, charges and the total. The cart discount is then allocated across lines in
 * proportion to their totals (BIZ-1.3) and folded into each `lineTotal`, so
 * Σ(cartDiscountAlloc) === discountAmount and Σ(lineTotal) === subtotal − discountAmount.
 */
export function priceSale(input: SalePricingInput): SalePricing {
  const lines = input.lines.map(priceSaleLine)
  const subtotal = lines.reduce((sum, line) => toWholeXaf(sum + line.lineTotal), 0)
  const discountAmount = Math.min(toWholeXaf(Math.max(0, input.cartDiscount ?? 0)), subtotal)
  const chargesAmount = toWholeXaf(Math.max(0, input.charges ?? 0))
  const totalAmount = Math.max(0, toWholeXaf(subtotal - discountAmount + chargesAmount))

  if (discountAmount > 0 && lines.length > 0) {
    const allocations = allocateProRata(
      discountAmount,
      lines.map((line) => line.lineTotal),
    )
    lines.forEach((line, i) => {
      line.cartDiscountAlloc = allocations[i] ?? 0
      line.lineTotal = Math.max(0, toWholeXaf(line.lineTotal - line.cartDiscountAlloc))
    })
  }

  return { lines, subtotal, discountAmount, chargesAmount, totalAmount }
}
