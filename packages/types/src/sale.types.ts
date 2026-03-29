export interface Sale {
  id: string
  businessId: string
  cashierId: string
  deviceId?: string
  totalAmount: number
  discountAmount: number
  taxAmount: number
  netAmount: number
  paymentMethod: PaymentMethod
  momoReference?: string
  notes?: string
  receiptNumber: string
  status: SaleStatus
  items: SaleItem[]
  // Sync metadata
  createdAt: Date
  updatedAt: Date
  isDeleted: boolean
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  // Sync metadata
  createdAt: Date
  updatedAt: Date
  isDeleted: boolean
}

export enum PaymentMethod {
  CASH = 'CASH',
  MTN_MOMO = 'MTN_MOMO',
  ORANGE_MONEY = 'ORANGE_MONEY',
  CARD = 'CARD',
  MIXED = 'MIXED',
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CANCELLED = 'CANCELLED',
}
