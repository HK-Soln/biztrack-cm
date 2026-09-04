import { Inject, Injectable } from '@nestjs/common'
import type { PaymentProviderAdapter } from './payment-provider.adapter'

/** DI token for the set of registered provider adapters. */
export const PAYMENT_ADAPTERS = Symbol('PAYMENT_ADAPTERS')

/**
 * Spec 07 §4 — resolves a provider adapter by catalogue code. A missing adapter (a catalogued
 * provider with no implementation yet) is a first-class state, not a crash: callers surface
 * PROVIDER_UNAVAILABLE rather than throwing.
 */
@Injectable()
export class PaymentAdapterRegistry {
  private readonly byCode = new Map<string, PaymentProviderAdapter>()

  constructor(@Inject(PAYMENT_ADAPTERS) adapters: PaymentProviderAdapter[]) {
    for (const adapter of adapters) this.byCode.set(adapter.code, adapter)
  }

  get(code: string): PaymentProviderAdapter | null {
    return this.byCode.get(code) ?? null
  }
}
