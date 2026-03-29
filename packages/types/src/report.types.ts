export interface DailySummary {
  businessId: string
  date: string
  totalSales: number
  totalRevenue: number
  totalExpenses: number
  grossProfit: number
  netProfit: number
  topProducts: Array<{
    productId: string
    productName: string
    quantitySold: number
    revenue: number
  }>
  paymentBreakdown: Record<string, number>
}

export interface SalesReport {
  period: ReportPeriod
  startDate: string
  endDate: string
  totalRevenue: number
  totalSales: number
  averageOrderValue: number
  dailyBreakdown: Array<{
    date: string
    revenue: number
    sales: number
  }>
}

export enum ReportPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}
