/// <reference types="jest" />
import { canTransitionOnlineOrder, isTerminalOnlineOrderStatus } from '@biztrack/types'

// The online-order fulfilment state machine (branches by fulfilment type), enforced by
// OnlineOrdersService.updateStatus.
describe('online order transitions — delivery', () => {
  it('follows the delivery flow', () => {
    expect(canTransitionOnlineOrder('DELIVERY', 'PENDING', 'CONFIRMED')).toBe(true)
    expect(canTransitionOnlineOrder('DELIVERY', 'CONFIRMED', 'PREPARING')).toBe(true)
    expect(canTransitionOnlineOrder('DELIVERY', 'PREPARING', 'READY_FOR_DISPATCH')).toBe(true)
    expect(canTransitionOnlineOrder('DELIVERY', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY')).toBe(
      true,
    )
    expect(canTransitionOnlineOrder('DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true)
  })

  it('handles a failed delivery (retry or cancel)', () => {
    expect(canTransitionOnlineOrder('DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED')).toBe(true)
    expect(canTransitionOnlineOrder('DELIVERY', 'DELIVERY_FAILED', 'OUT_FOR_DELIVERY')).toBe(true)
    expect(canTransitionOnlineOrder('DELIVERY', 'DELIVERY_FAILED', 'CANCELLED')).toBe(true)
  })

  it('rejects pickup-only states in a delivery order', () => {
    expect(canTransitionOnlineOrder('DELIVERY', 'PREPARING', 'READY_FOR_PICKUP')).toBe(false)
    expect(canTransitionOnlineOrder('DELIVERY', 'PREPARING', 'PICKED_UP')).toBe(false)
  })
})

describe('online order transitions — pickup', () => {
  it('follows the pickup flow', () => {
    expect(canTransitionOnlineOrder('PICKUP', 'PREPARING', 'READY_FOR_PICKUP')).toBe(true)
    expect(canTransitionOnlineOrder('PICKUP', 'READY_FOR_PICKUP', 'PICKED_UP')).toBe(true)
  })

  it('rejects delivery-only states in a pickup order', () => {
    expect(canTransitionOnlineOrder('PICKUP', 'PREPARING', 'READY_FOR_DISPATCH')).toBe(false)
    expect(canTransitionOnlineOrder('PICKUP', 'PREPARING', 'OUT_FOR_DELIVERY')).toBe(false)
  })
})

describe('online order transitions — common rules', () => {
  it('allows cancel before completion', () => {
    expect(canTransitionOnlineOrder('DELIVERY', 'PENDING', 'CANCELLED')).toBe(true)
    expect(canTransitionOnlineOrder('PICKUP', 'READY_FOR_PICKUP', 'CANCELLED')).toBe(true)
  })

  it('rejects illegal jumps, backward moves, and no-op same-status updates', () => {
    expect(canTransitionOnlineOrder('DELIVERY', 'PENDING', 'DELIVERED')).toBe(false)
    expect(canTransitionOnlineOrder('DELIVERY', 'DELIVERED', 'PENDING')).toBe(false)
    expect(canTransitionOnlineOrder('DELIVERY', 'PREPARING', 'PREPARING')).toBe(false)
  })

  it('allows RETURNED after completion; terminal states have no exits', () => {
    expect(canTransitionOnlineOrder('DELIVERY', 'DELIVERED', 'RETURNED')).toBe(true)
    expect(canTransitionOnlineOrder('PICKUP', 'PICKED_UP', 'RETURNED')).toBe(true)
    expect(isTerminalOnlineOrderStatus('DELIVERY', 'RETURNED')).toBe(true)
    expect(isTerminalOnlineOrderStatus('DELIVERY', 'CANCELLED')).toBe(true)
    expect(isTerminalOnlineOrderStatus('PICKUP', 'PICKED_UP')).toBe(false) // can still be RETURNED
  })
})
