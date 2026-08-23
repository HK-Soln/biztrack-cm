import { create } from 'zustand'

/** The outcome of a manager step-up request: the authorizing manager, or null if
 * the cashier cancelled. */
export type StepUpResolution = {
  authorizedByUserId: string
  authorizedByName: string | null
} | null

interface StepUpState {
  open: boolean
  /** Open the step-up modal and resolve when the manager authorizes or it is cancelled. */
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
      // A second request while one is open cancels the first.
      pendingResolve?.(null)
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
 * Resolves with the authorizing manager, or null if cancelled. Requires
 * <ManagerStepUpModal /> to be mounted once at the app root.
 */
export function requestManagerStepUp(): Promise<StepUpResolution> {
  return useStepUpStore.getState().request()
}
