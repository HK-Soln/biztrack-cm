export interface Expense {
  id: string
  businessId: string
  recordedById: string
  category: ExpenseCategory
  description: string
  amount: number
  paymentMethod: string
  receiptUrl?: string
  date: Date
  // Sync metadata
  createdAt: Date
  updatedAt: Date
  isDeleted: boolean
}

export enum ExpenseCategory {
  RENT = 'RENT',
  UTILITIES = 'UTILITIES',
  SUPPLIES = 'SUPPLIES',
  SALARIES = 'SALARIES',
  TRANSPORT = 'TRANSPORT',
  MARKETING = 'MARKETING',
  MAINTENANCE = 'MAINTENANCE',
  OTHER = 'OTHER',
}
