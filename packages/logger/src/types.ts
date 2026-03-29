export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface LogMetadata {
  [key: string]: unknown
}

export interface PerformanceMetrics {
  duration: number
  memory?: {
    heapUsed: number
    heapTotal: number
    rss: number
  }
}
