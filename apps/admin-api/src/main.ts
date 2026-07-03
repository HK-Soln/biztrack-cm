import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { logger } from '@biztrack/logger'
import { AppModule } from './app.module'
import { NodeEnv, type AppConfig } from './config/configuration'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get<ConfigService<AppConfig>>(ConfigService)

  // Trust the proxy so req.ip reflects the real client (for the IP allowlist).
  app.set('trust proxy', true)

  const nodeEnv = config.get('NODE_ENV', { infer: true })
  const corsRaw = config.get('ADMIN_CORS_ORIGINS', { infer: true }) ?? ''
  const allowedOrigins = new Set(
    corsRaw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  )
  const allowAllInDev = nodeEnv !== NodeEnv.PRODUCTION && allowedOrigins.size === 0

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (allowAllInDev) return callback(null, true)
      if (allowedOrigins.has(origin)) return callback(null, true)
      return callback(new Error(`Origin not allowed by CORS: ${origin}`), false)
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  })

  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )

  const port = config.get('ADMIN_PORT', { infer: true }) ?? 3002
  await app.listen(port, '::')
  logger.log(`Admin API is running on port ${port}`, 'Bootstrap')
}

bootstrap()
