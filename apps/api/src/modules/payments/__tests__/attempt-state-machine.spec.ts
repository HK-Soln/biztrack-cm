import {
  PaymentAttemptStatus,
  PAYMENT_ATTEMPT_TERMINAL,
  canTransitionPaymentAttempt,
} from '@biztrack/types'

const { INITIATED, PENDING, CONFIRMED, FAILED, EXPIRED } = PaymentAttemptStatus

describe('payment attempt state machine (§2.4/§8)', () => {
  it('allows the forward path INITIATED → PENDING → CONFIRMED', () => {
    expect(canTransitionPaymentAttempt(INITIATED, PENDING)).toBe(true)
    expect(canTransitionPaymentAttempt(PENDING, CONFIRMED)).toBe(true)
    expect(canTransitionPaymentAttempt(INITIATED, CONFIRMED)).toBe(true)
  })

  it('NEVER regresses a terminal attempt (a late/duplicate webhook is a no-op)', () => {
    for (const terminal of [CONFIRMED, FAILED, EXPIRED]) {
      for (const to of [INITIATED, PENDING, CONFIRMED, FAILED, EXPIRED]) {
        expect(canTransitionPaymentAttempt(terminal, to)).toBe(false)
      }
    }
  })

  it('does not auto-transition EXPIRED → CONFIRMED (late confirm is a reconciliation exception)', () => {
    expect(canTransitionPaymentAttempt(EXPIRED, CONFIRMED)).toBe(false)
  })

  it('marks CONFIRMED/FAILED/EXPIRED terminal', () => {
    expect(PAYMENT_ATTEMPT_TERMINAL).toEqual([CONFIRMED, FAILED, EXPIRED])
  })
})
