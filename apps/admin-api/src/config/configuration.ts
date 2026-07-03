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
    (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))
  return hasMatchingQuotes ? text.slice(1, -1) : text
}

const normalizeNumber = (value: unknown) => {
  if (value === undefined) return value
  return Number(normalizeEnvString(value))
}

const envSchema = z.object({
  NODE_ENV: z.preprocess(normalizeEnvString, z.nativeEnum(NodeEnv)).default(NodeEnv.DEVELOPMENT),
  ADMIN_PORT: z.preprocess(normalizeNumber, z.number().int().positive()).default(3002),

  // Shared infrastructure (same DB + Redis as apps/api)
  DATABASE_URL: z.preprocess(normalizeEnvString, z.string().min(1)),
  REDIS_URL: z.preprocess(normalizeEnvString, z.string().min(1)),

  // Admin auth — separate secrets from the client API
  ADMIN_JWT_ACCESS_SECRET: z.preprocess(normalizeEnvString, z.string().min(1)),
  ADMIN_JWT_REFRESH_SECRET: z.preprocess(normalizeEnvString, z.string().min(1)),
  ADMIN_ACCESS_TOKEN_TTL: z.preprocess(normalizeEnvString, z.string().min(1)).default('1h'),
  ADMIN_REFRESH_TOKEN_TTL_HOURS: z.preprocess(normalizeNumber, z.number().int().positive()).default(8),

  // Password hashing (shared convention with apps/api)
  PASSWORD_SALT_ROUNDS: z.preprocess(normalizeNumber, z.number().int().positive()).default(12),
  PASSWORD_PEPPER: z.preprocess(normalizeEnvString, z.string()).optional(),

  // Login lockout
  ADMIN_LOGIN_MAX_ATTEMPTS: z.preprocess(normalizeNumber, z.number().int().positive()).default(10),
  ADMIN_LOGIN_LOCK_MINUTES: z.preprocess(normalizeNumber, z.number().int().positive()).default(60),

  // IP allowlist — comma-separated. Empty = open (dev); set = enforced (prod).
  ADMIN_ALLOWED_IPS: z.preprocess(normalizeEnvString, z.string()).optional(),

  // CORS — comma-separated allowed origins (admin-web). Empty in dev = allow all.
  ADMIN_CORS_ORIGINS: z.preprocess(normalizeEnvString, z.string()).optional(),

  // First super admin (consumed by the seed script only)
  ADMIN_SEED_EMAIL: z.preprocess(normalizeEnvString, z.string().email()).optional(),
  ADMIN_SEED_PASSWORD: z.preprocess(normalizeEnvString, z.string()).optional(),
})

export type AppConfig = z.infer<typeof envSchema>

export const validateEnv = (config: Record<string, unknown>): AppConfig => {
  const parsed = envSchema.safeParse(config)
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid admin environment configuration: ${message}`)
  }
  return parsed.data
}
