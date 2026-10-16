// ---------------------------------------------------------------------------
// Who in the business may take an action that undoes or writes off value (ruling R21).
// The server's endpoints and the till's main process both check this, and the screens use
// it to decide which buttons to show. It is a role rule, separate from the plan rules in
// `permissions.ts` (which decide whether the business has a feature at all).
// ---------------------------------------------------------------------------

export type StaffAction =
  /** Void a sale. */
  | 'SALE_VOID'
  /** Refund or return a sale, in full or in part. */
  | 'SALE_REFUND'
  /** Adjust stock by hand, or retire a serial unit. */
  | 'STOCK_ADJUST'
  /** Delete a product or one of its variants, writing off its stock. */
  | 'PRODUCT_DELETE'

const OWNER_OR_MANAGER: readonly string[] = ['OWNER', 'MANAGER']

const ALLOWED: Record<StaffAction, readonly string[]> = {
  SALE_VOID: OWNER_OR_MANAGER,
  SALE_REFUND: OWNER_OR_MANAGER,
  STOCK_ADJUST: OWNER_OR_MANAGER,
  PRODUCT_DELETE: OWNER_OR_MANAGER,
}

/** Whether a member with `role` (OWNER, MANAGER, CASHIER, ...) may take `action`. */
export function staffMay(role: string | null | undefined, action: StaffAction): boolean {
  return !!role && ALLOWED[action].includes(role.toUpperCase())
}
