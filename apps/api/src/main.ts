import { NestFactory } from '@nestjs/core'
import { VersioningType } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { join } from 'path'
import { logger } from '@biztrack/logger'
import { AppModule } from './app.module'
import { mountBullBoard } from './common/queues/bull-board'
import { RedisService } from './common/redis/redis.service'
import { NodeEnv, type AppConfig } from './config/configuration'
import { createI18nValidationPipe } from './common/pipes/i18n-validation.pipe'
import cookieParser from 'cookie-parser'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })

  const config = app.get<ConfigService<AppConfig>>(ConfigService)

  // Serve locally-stored uploads (local storage driver) at /uploads. Harmless when the
  // S3/R2 driver is active (the folder is just empty and unused).
  const uploadsDir =
    config.get('STORAGE_LOCAL_DIR', { infer: true }) ?? join(process.cwd(), 'uploads')
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' })
  const redis = app.get<RedisService>(RedisService)
  const nodeEnv = config.get('NODE_ENV', { infer: true })
  const corsOriginsRaw = config.get('CORS_ORIGINS', { infer: true })
  const allowNullOriginRaw = config.get('CORS_ALLOW_NULL_ORIGIN', { infer: true })
  const allowNullOrigin = allowNullOriginRaw === 'true'
  // Exact origins plus wildcard suffixes. A CORS_ORIGINS entry like `*.biztrack.cm`
  // matches the apex and any subdomain (host-only, so scheme/port are ignored) — needed
  // because storefronts live on dynamic `{slug}.biztrack.cm` subdomains that can't be listed.
  const exactOrigins = new Set<string>()
  const wildcardSuffixes: string[] = []
  for (const entry of (corsOriginsRaw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)) {
    if (entry.startsWith('*.'))
      wildcardSuffixes.push(entry.slice(1)) // '.biztrack.cm'
    else exactOrigins.add(entry)
  }
  const configuredCount = exactOrigins.size + wildcardSuffixes.length
  const allowAllInDev = nodeEnv !== NodeEnv.PRODUCTION && configuredCount === 0

  const matchesWildcard = (origin: string): boolean => {
    if (wildcardSuffixes.length === 0) return false
    try {
      const host = new URL(origin).hostname
      return wildcardSuffixes.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
    } catch {
      return false
    }
  }

  if (nodeEnv === NodeEnv.PRODUCTION && configuredCount === 0) {
    logger.warn(
      'CORS_ORIGINS is empty in production. No browser origins will be allowed.',
      'Bootstrap',
    )
  }

  app.enableCors({
    origin: (origin, callback) => {
      logger.debug(origin, 'Incoming request origin...')
      if (!origin) return callback(null, true)
      if (origin === 'null' && allowNullOrigin) return callback(null, true)
      if (allowAllInDev) return callback(null, true)
      if (exactOrigins.has(origin) || matchesWildcard(origin)) return callback(null, true)
      return callback(new Error(`Origin not allowed by CORS: ${origin}`), false)
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Request-Id',
      'X-Skip-Auth-Refresh',
      'X-Skip-Auth',
      'X-Device-Type',
      'X-Platform',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  })
  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  })

  app.useGlobalPipes(createI18nValidationPipe())
  app.use(cookieParser())

  const bullBoardPath = mountBullBoard(app)
  if (nodeEnv !== NodeEnv.PRODUCTION) {
    logger.log(`Bull Board is available at ${bullBoardPath}`, 'Bootstrap')
  }

  const redisState = redis.getConnectionState()
  logger.log(
    `Redis/Bull connection state: ${redisState.configured ? redisState.status : 'not_configured'}`,
    'Bootstrap',
  )

  const port = config.get('PORT', { infer: true }) ?? 3001
  await app.listen(port, '::') // Listen on all interfaces (IPv4 & IPv6)

  logger.log(`API is running on port ${port}`, 'Bootstrap')
}

bootstrap()
