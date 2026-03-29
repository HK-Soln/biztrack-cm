export interface Product {
  id: string
  businessId: string
  name: string
  description?: string
  sku?: string
  barcode?: string
  price: number
  costPrice?: number
  stockQuantity: number
  lowStockThreshold: number
  unit: ProductUnit
  categoryId?: string
  imageUrl?: string
  isActive: boolean
  // Sync metadata
  createdAt: Date
  updatedAt: Date
  isDeleted: boolean
}

export interface ProductCategory {
  id: string
  businessId: string
  name: string
  createdAt: Date
  updatedAt: Date
  isDeleted: boolean
}

export enum ProductUnit {
  PIECE = 'piece',
  KG = 'kg',
  LITRE = 'litre',
  METRE = 'metre',
  BOX = 'box',
  DOZEN = 'dozen',
  PACK = 'pack',
}
