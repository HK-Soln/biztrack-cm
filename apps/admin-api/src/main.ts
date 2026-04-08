import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true })
  const config = app.get(ConfigService)
  const port = config.get<number>('admin.port') ?? 3002

  await app.listen(port)
}

bootstrap()
