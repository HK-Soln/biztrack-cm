import { NestFactory } from '@nestjs/core'
import { VersioningType, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { logger } from '@biztrack/logger'
import { AppModule } from './app.module'
import type { AppConfig } from './config/configuration'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors()
  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  const config = app.get<ConfigService<AppConfig>>(ConfigService)
  const port = config.get('API_PORT', { infer: true }) ?? 3001

  await app.listen(port)

  logger.log(`API is running on port ${port}`, 'Bootstrap');
}

bootstrap()
