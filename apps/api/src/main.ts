import { NestFactory } from '@nestjs/core'
import { VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { logger } from '@biztrack/logger'
import { AppModule } from './app.module'
import type { AppConfig } from './config/configuration'
import { createI18nValidationPipe } from './common/pipes/i18n-validation.pipe'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors()
  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  })

  app.useGlobalPipes(createI18nValidationPipe())

  const config = app.get<ConfigService<AppConfig>>(ConfigService)
  const port = config.get('API_PORT', { infer: true }) ?? 3001

  await app.listen(port)

  logger.log(`API is running on port ${port}`, 'Bootstrap');
}

bootstrap()
