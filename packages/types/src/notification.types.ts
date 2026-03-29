export interface Notification {
  id: string
  userId: string
  title: string
  body: string
  type: NotificationType
  isRead: boolean
  data?: Record<string, unknown>
  createdAt: Date
}

export enum NotificationType {
  LOW_STOCK = 'LOW_STOCK',
  DAILY_SUMMARY = 'DAILY_SUMMARY',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  SUBSCRIPTION_EXPIRING = 'SUBSCRIPTION_EXPIRING',
  SYSTEM = 'SYSTEM',
}
