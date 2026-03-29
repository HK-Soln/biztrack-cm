export interface SubscriptionPayment {
  id: string
  businessId: string
  plan: string
  amount: number
  currency: string
  paymentMethod: string
  momoReference?: string
  status: PaymentStatus
  paidAt?: Date
  createdAt: Date
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export interface CampayPaymentInit {
  amount: string
  currency: 'XAF'
  from: string
  description: string
  external_reference: string
}

export interface CampayPaymentResponse {
  reference: string
  ussd_code: string
  operator: string
  status: string
}
