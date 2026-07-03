import { z } from 'zod'

export enum NodeEnv {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

const normalizeEnvString = (value: unknown) => {
  if (value === undefined || value === null) return value
  const text = String(value).trim()
  const hasMatchingQuotes =
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))

  return hasMatchingQuotes ? text.slice(1, -1) : text
}

const normalizeEnvArray = (value: unknown) => {
  if (value === undefined) return value
  if (Array.isArray(value)) return value.map(normalizeEnvString)
  return typeof value === 'string' && value.includes(',')
    ? value.split(',').map(normalizeEnvString)
    : [normalizeEnvString(value)]
}

const normalizeNumber = (value: unknown) => {
  if (value === undefined) return value
  return Number(normalizeEnvString(value))
}

const envSchema = z.object({
  NODE_ENV: z.preprocess(normalizeEnvString, z.nativeEnum(NodeEnv)),
  DATABASE_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  JWT_SECRET: z.preprocess(normalizeEnvString, z.string().min(1)),
  JWT_EXPIRES_IN: z.preprocess(normalizeEnvString, z.string().min(1)).default('15m'),
  JWT_REFRESH_SECRET: z.preprocess(normalizeEnvString, z.string().min(1)),
  JWT_REFRESH_EXPIRES_IN: z.preprocess(normalizeEnvString, z.string().min(1)).default('30d'),
  SYNC_JWT_SECRET: z.preprocess(normalizeEnvString, z.string().min(1)).optional(),
  PORT: z.preprocess(normalizeNumber, z.number().int().positive()).default(3001),
  API_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  NEXT_PUBLIC_API_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  CORS_ORIGINS: z.preprocess(normalizeEnvString, z.string()).optional(),
  CORS_ALLOW_NULL_ORIGIN: z.preprocess(
    (value) => (value === undefined ? undefined : String(normalizeEnvString(value)).toLowerCase()),
    z.enum(['true', 'false']).optional(),
  ),
  REFRESH_COOKIE_NAME: z.preprocess(normalizeEnvString, z.string()).optional(),
  REFRESH_COOKIE_DOMAIN: z.preprocess(normalizeEnvString, z.string()).optional(),
  REFRESH_COOKIE_SAMESITE: z.preprocess(
    (value) => (value === undefined ? undefined : String(normalizeEnvString(value)).toLowerCase()),
    z.enum(['lax', 'strict', 'none']).optional(),
  ),
  LOG_LEVEL: z.preprocess(normalizeEnvString, z.string()).optional(),
  LOG_DIR: z.preprocess(normalizeEnvString, z.string()).optional(),
  PASSWORD_SALT_ROUNDS: z.preprocess(normalizeNumber, z.number().int().positive()).default(12),
  PASSWORD_PEPPER: z.preprocess(normalizeEnvString, z.string()).optional(),
  OTP_TTL_MINUTES: z.preprocess(normalizeNumber, z.number().int().positive()).default(10),
  REDIS_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  INVITE_TTL_DAYS: z.preprocess(normalizeNumber, z.number().int().positive()).default(7),
  MVP_PAID_PLAN_TRIAL_DAYS: z.preprocess(normalizeNumber, z.number().int().positive()).default(180),
  // Frontend URL — used to construct invite deep-links in notification bodies
  APP_URL: z.preprocess(normalizeEnvString, z.string().url()).optional(),
  // Resend (email notifications + webhooks)
  RESEND_API_KEY: z.preprocess(normalizeEnvString, z.string()).optional(),
  RESEND_API_BASE_URL: z.preprocess(normalizeEnvString, z.string().url()).optional(),
  RESEND_WEBHOOK_SECRET: z.preprocess(normalizeEnvString, z.string()).optional(),
  RESEND_SENDER_DOMAINS: z.preprocess(normalizeEnvArray, z.array(z.string().min(1)).min(1)),
  // For receiving notifications about important account events (e.g. approaching usage limits)
  FOUNDER_EMAIL: z.preprocess(normalizeEnvString, z.string().email()).optional(),
  // Waiting list feature flags
  INTERNAL_API_SECRET: z.preprocess(normalizeEnvString, z.string()).optional(),
  // WAHA (WhatsApp HTTP API) — self-hosted WhatsApp gateway
  WHATSAPP_BASE_URL: z.preprocess(normalizeEnvString, z.string().url()).optional(),
  WHATSAPP_API_KEY: z.preprocess(normalizeEnvString, z.string()).optional(),
  WHATSAPP_SESSION: z.preprocess(normalizeEnvString, z.string()).default('default'),
  WHATSAPP_WEBHOOK_SECRET: z.preprocess(normalizeEnvString, z.string()).optional(),
  // File storage. Default 'local' (writes to a served folder — dev/self-host). Set
  // 's3' + the S3_* vars for Cloudflare R2 (or any S3-compatible: B2, Supabase, MinIO).
  STORAGE_DRIVER: z.preprocess(normalizeEnvString, z.enum(['local', 's3'])).default('local'),
  STORAGE_LOCAL_DIR: z.preprocess(normalizeEnvString, z.string()).optional(),
  STORAGE_PUBLIC_URL: z.preprocess(normalizeEnvString, z.string()).optional(),
  S3_ENDPOINT: z.preprocess(normalizeEnvString, z.string().url()).optional(),
  S3_REGION: z.preprocess(normalizeEnvString, z.string()).default('auto'),
  S3_BUCKET: z.preprocess(normalizeEnvString, z.string()).optional(),
  S3_ACCESS_KEY_ID: z.preprocess(normalizeEnvString, z.string()).optional(),
  S3_SECRET_ACCESS_KEY: z.preprocess(normalizeEnvString, z.string()).optional(),
  S3_PUBLIC_URL: z.preprocess(normalizeEnvString, z.string()).optional(),
})

export type AppConfig = z.infer<typeof envSchema>

export const validateEnv = (config: Record<string, unknown>): AppConfig => {
  const parsed = envSchema.safeParse(config)
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment configuration: ${message}`)
  }
  return parsed.data
}
