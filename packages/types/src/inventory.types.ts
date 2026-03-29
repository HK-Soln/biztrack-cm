export interface StockMovement {
  id: string
  businessId: string
  productId: string
  type: StockMovementType
  quantity: number
  previousQuantity: number
  newQuantity: number
  reason?: string
  referenceId?: string
  recordedById: string
  createdAt: Date
  updatedAt: Date
  isDeleted: boolean
}

export enum StockMovementType {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  ADJUSTMENT = 'ADJUSTMENT',
  RETURN = 'RETURN',
  LOSS = 'LOSS',
  TRANSFER = 'TRANSFER',
}
