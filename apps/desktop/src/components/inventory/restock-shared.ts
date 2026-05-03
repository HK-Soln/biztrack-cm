'use client'

import { PaymentMethod, type RestockPaymentRequest } from '@biztrack/types'

export type RestockPaymentDraft = {
  id: string
  method: PaymentMethod
  amount: string
  mobileMoneyReference: string
}

export function createRestockPaymentDraft(
  method: PaymentMethod = PaymentMethod.CASH,
): RestockPaymentDraft {
  return {
    id: crypto.randomUUID(),
    method,
    amount: '',
    mobileMoneyReference: '',
  }
}

export function isMobileMoneyPaymentMethod(method: PaymentMethod) {
  return method === PaymentMethod.MTN_MOMO || method === PaymentMethod.ORANGE_MONEY
}

export function getValidPaymentAmount(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

export function sumRestockPaymentDrafts(payments: RestockPaymentDraft[]) {
  return payments.reduce((sum, payment) => sum + (getValidPaymentAmount(payment.amount) ?? 0), 0)
}

export function mapRestockPaymentDrafts(
  payments: RestockPaymentDraft[],
): RestockPaymentRequest[] {
  return payments.map((payment) => ({
    method: payment.method,
    amount: Number(payment.amount.trim()),
    mobileMoneyReference: payment.mobileMoneyReference.trim() || undefined,
  }))
}
