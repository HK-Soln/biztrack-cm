import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '@/modules/auth/auth.module'
import { UsersModule } from '@/modules/users/users.module'
import { BusinessModule } from '@/modules/business/business.module'
import { ProductsModule } from '@/modules/products/products.module'
import { SyncModule } from '@/modules/sync/sync.module'
import { LoggerModule } from './logger/logger.module'
import { join } from 'path'
import { AppConfig, NodeEnv, validateEnv } from './config/configuration'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware'
import type { MiddlewareConsumer, NestModule } from '@nestjs/common'

const entitiesPath = join(__dirname, '**', '*.entity.{ts,js}').replace(/\\/g, '/')
const migrationsPath = join(__dirname, 'database', 'migrations', '*{.ts,.js}').replace(/\\/g, '/')

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL', { infer: true }),
        entities: [entitiesPath],
        migrations: [migrationsPath],
        synchronize: config.get('NODE_ENV', { infer: true }) !== NodeEnv.PRODUCTION,
        logging: config.get('NODE_ENV', { infer: true }) === NodeEnv.DEVELOPMENT,
      }),
    }),
    AuthModule,
    UsersModule,
    BusinessModule,
    ProductsModule,
    SyncModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, RequestLoggingMiddleware).forRoutes('*')
  }
}
