import { create } from 'zustand'

/**
 * The outcome of a manager step-up request:
 * - `approved`  — a manager verified with a PIN or a scanned card.
 * - `override`  — the cashier chose to continue WITHOUT approval (the sale still rings up, but the
 *                 backend flags the discount unauthorized).
 * - `cancelled` — the action was abandoned; the caller must NOT proceed (no sale is rung up).
 */
export type StepUpResolution =
  | { type: 'approved'; authorizedByUserId: string; authorizedByName: string | null }
  | { type: 'override' }
  | { type: 'cancelled' }

interface StepUpState {
  open: boolean
  /** Open the step-up modal and resolve when the manager authorizes, overrides, or cancels. */
  request: () => Promise<StepUpResolution>
  /** Called by the modal to settle the pending request. */
  resolve: (result: StepUpResolution) => void
}

// The pending promise resolver lives outside the store so it never triggers a render.
let pendingResolve: ((result: StepUpResolution) => void) | null = null

export const useStepUpStore = create<StepUpState>((set) => ({
  open: false,
  request() {
    return new Promise<StepUpResolution>((resolve) => {
      // A second request while one is open cancels the first (abort — do not proceed).
      pendingResolve?.({ type: 'cancelled' })
      pendingResolve = resolve
      set({ open: true })
    })
  },
  resolve(result) {
    const settle = pendingResolve
    pendingResolve = null
    set({ open: false })
    settle?.(result)
  },
}))

/**
 * Request manager step-up authorization from anywhere (e.g. an over-limit discount).
 * Resolves with `approved`, `override` (continue unapproved), or `cancelled` (abort). Requires
 * <ManagerStepUpModal /> to be mounted once at the app root.
 */
export function requestManagerStepUp(): Promise<StepUpResolution> {
  return useStepUpStore.getState().request()
}
