import type { ListQuery } from './http.types'

// Review flags: things the server accepted but the owner should look at. A sale or refund
// made at an offline till already happened, so the server records it and raises a flag
// instead of rejecting or rewriting it (rulings R1–R3, docs/design/domain-package.md).

export enum ReviewFlagCode {
  /** A till refunded more than the returned goods are worth. */
  REFUND_AMOUNT_MISMATCH = 'REFUND_AMOUNT_MISMATCH',
  /** A till refunded more than was paid on the sale: a typo or theft. */
  REFUND_EXCEEDS_PAID = 'REFUND_EXCEEDS_PAID',
  /** A till returned lines or quantities the server could not apply as sent. */
  REFUND_QUANTITY_MISMATCH = 'REFUND_QUANTITY_MISMATCH',
  /** A synced sale took stock below zero. */
  NEGATIVE_STOCK = 'NEGATIVE_STOCK',
  /** A synced sale sold a serial unit that was already sold elsewhere. */
  SERIAL_ALREADY_SOLD = 'SERIAL_ALREADY_SOLD',
  /** A synced sale's discount was not covered by the cashier's or approver's limits. */
  DISCOUNT_UNAUTHORIZED = 'DISCOUNT_UNAUTHORIZED',
}

export enum ReviewFlagSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ReviewFlagStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

/** What a flag is about. Only sales today. */
export type ReviewFlagEntityType = 'sale'

/** A flag decided by the domain, before it is stored. */
export interface ReviewFlagDraft {
  code: ReviewFlagCode
  severity: ReviewFlagSeverity
  entityType: ReviewFlagEntityType
  entityId: string
  /** Stable per occurrence, so a retried sync never raises the same flag twice. */
  dedupeKey: string
  /** The branch the flag belongs to, once branches exist. */
  outletId?: string | null
  /** The numbers behind the flag (amounts, quantities, ids). */
  details: Record<string, unknown>
}

export interface ReviewFlag extends ReviewFlagDraft {
  id: string
  businessId: string
  status: ReviewFlagStatus
  createdAt: string
  resolvedAt: string | null
  resolvedById: string | null
  resolutionNote: string | null
}

export interface ReviewFlagsQuery extends ListQuery {
  status?: ReviewFlagStatus
  severity?: ReviewFlagSeverity
  code?: ReviewFlagCode
  entityId?: string
}

export interface ResolveReviewFlagRequest {
  note?: string
}
