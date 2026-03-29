import fs from 'fs'
import path from 'path'
import { AsyncLocalStorage } from 'async_hooks'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

import type { LogMetadata, PerformanceMetrics } from './types'

const { combine, timestamp, errors, splat, colorize, printf } = winston.format

type LogMessage = string | Error

const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'secretKey',
  'apiKey',
  'authorization',
  'cookie',
  'creditCard',
  'ssn',
  'qrCodeUrl',
  'phoneNumber',
  'email',
  'sessionToken',
  'backupCodes',
  'deviceFingerprint',
  'phone'
]

const redactSensitiveData = (obj: unknown): unknown => {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(redactSensitiveData)

  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    const isSensitive = SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))

    if (isSensitive) {
      redacted[key] = '[REDACTED]'
    } else if (typeof value === 'object') {
      redacted[key] = redactSensitiveData(value)
    } else {
      redacted[key] = value
    }
  }

  return redacted
}

const structuredFormat = printf(({ timestamp: ts, level, message, context, requestId, ...metadata }) => {
  const logObject: Record<string, unknown> = {
    timestamp: ts,
    level,
    message,
  }

  if (context) logObject.context = context
  if (requestId) logObject.requestId = requestId

  if (Object.keys(metadata).length > 0) {
    Object.assign(logObject, redactSensitiveData(metadata) as Record<string, unknown>)
  }

  return JSON.stringify(logObject)
})

const consoleFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  colorize({ all: true }),
  printf(({ timestamp: ts, level, message, context, requestId, ...metadata }) => {
    let logLine = `${ts} [${level}]`

    if (context) logLine += ` [${context}]`
    if (requestId) logLine += ` [${requestId}]`

    logLine += ` ${message}`

    if (Object.keys(metadata).length > 0) {
      logLine += ` ${JSON.stringify(redactSensitiveData(metadata))}`
    }

    return logLine
  }),
)

const jsonFormat = combine(timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }), structuredFormat)

const asyncLocalStorage = new AsyncLocalStorage<Map<string, unknown>>()

const isProduction = process.env.NODE_ENV === 'production'
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')
const logDir = process.env.LOG_DIR ?? (isProduction ? 'logs' : undefined)

const transports: winston.transport[] = [
  new winston.transports.Console({
    level: logLevel,
    format: isProduction ? jsonFormat : consoleFormat,
  }),
]

if (logDir) {
  fs.mkdirSync(logDir, { recursive: true })

  transports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
      format: jsonFormat,
    }),
  )

  transports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: jsonFormat,
    }),
  )
}

const baseLogger = winston.createLogger({
  level: logLevel,
  format: combine(timestamp(), errors({ stack: true }), splat()),
  transports,
  exitOnError: false,
})

const getRequestId = (): string | undefined => {
  const store = asyncLocalStorage.getStore()
  return store?.get('requestId') as string | undefined
}

const buildMetadata = (context?: string, metadata?: LogMetadata): LogMetadata => {
  const requestId = getRequestId()
  return {
    ...(context ? { context } : {}),
    ...(requestId ? { requestId } : {}),
    ...(metadata ?? {}),
  }
}

const normalizeMessage = (message: LogMessage) => {
  if (message instanceof Error) {
    return { message: message.message, meta: { stack: message.stack } }
  }
  return { message, meta: undefined as LogMetadata | undefined }
}

export interface Logger {
  log: (message: LogMessage, context?: string, metadata?: LogMetadata) => void
  warn: (message: LogMessage, context?: string, metadata?: LogMetadata) => void
  error: (message: LogMessage, context?: string, metadata?: LogMetadata) => void
  debug: (message: LogMessage, context?: string, metadata?: LogMetadata) => void
  logPerformance: (
    message: string,
    metrics: PerformanceMetrics,
    context?: string,
    metadata?: LogMetadata,
  ) => void
  setContext: (context: string) => void
  child: (context: string) => Logger
}

const createLogger = (initialContext?: string): Logger => {
  let context = initialContext

  return {
    setContext: (next) => {
      context = next
    },
    child: (next) => createLogger(next),
    log: (message, ctx, metadata) => {
      const { message: msg, meta } = normalizeMessage(message)
      baseLogger.info(msg, buildMetadata(ctx ?? context, { ...meta, ...metadata }))
    },
    warn: (message, ctx, metadata) => {
      const { message: msg, meta } = normalizeMessage(message)
      baseLogger.warn(msg, buildMetadata(ctx ?? context, { ...meta, ...metadata }))
    },
    error: (message, ctx, metadata) => {
      const { message: msg, meta } = normalizeMessage(message)
      baseLogger.error(msg, buildMetadata(ctx ?? context, { ...meta, ...metadata }))
    },
    debug: (message, ctx, metadata) => {
      const { message: msg, meta } = normalizeMessage(message)
      baseLogger.debug(msg, buildMetadata(ctx ?? context, { ...meta, ...metadata }))
    },
    logPerformance: (message, metrics, ctx, metadata) => {
      baseLogger.info(message, {
        ...buildMetadata(ctx ?? context, metadata),
        ...metrics,
      })
    },
  }
}

export const withRequestContext = <T>(requestId: string, fn: () => T): T => {
  const store = new Map<string, unknown>()
  store.set('requestId', requestId)
  return asyncLocalStorage.run(store, fn)
}

export const logger = createLogger()
export const rawLogger = baseLogger
export { createLogger }
