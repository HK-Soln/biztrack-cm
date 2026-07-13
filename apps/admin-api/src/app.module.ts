import { Module } from '@nestjs/common'
import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { join } from 'path'
import { type AppConfig, validateEnv } from './config/configuration'
import { LoggerModule } from './logger/logger.module'
import { RedisModule } from './common/redis/redis.module'
import { SecurityModule } from './common/security/security.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { AuditInterceptor } from './common/interceptors/audit.interceptor'
import { AdminExceptionFilter } from './common/filters/admin-exception.filter'
import { AdminJwtGuard } from './common/guards/admin-jwt.guard'
import { AdminPermissionGuard } from './common/guards/admin-permission.guard'
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'
import { IpAllowlistMiddleware } from './common/middleware/ip-allowlist.middleware'
import { AuditLog } from './entities/audit-log.entity'
import { HealthModule } from './modules/health/health.module'
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module'
import { AdminRolesModule } from './modules/admin-roles/admin-roles.module'
import { AdminUsersModule } from './modules/admin-users/admin-users.module'
import { BusinessesModule } from './modules/businesses/businesses.module'
import { ClientUsersModule } from './modules/client-users/client-users.module'
import { SupportModule } from './modules/support/support.module'

const entitiesPath = join(__dirname, '**', '*.entity.{ts,js}').replace(/\\/g, '/')

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1, limit: 10 },
      { name: 'medium', ttl: 60, limit: 60 },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL', { infer: true }),
        entities: [entitiesPath],
        // Migrations are owned by apps/api (single schema owner for the shared DB).
        migrations: [],
        synchronize: false,
        logging: false,
      }),
    }),
    // Make the AuditLog repository available to the global AuditInterceptor.
    TypeOrmModule.forFeature([AuditLog]),
    RedisModule,
    SecurityModule,
    HealthModule,
    AdminAuthModule,
    AdminRolesModule,
    AdminUsersModule,
    BusinessesModule,
    ClientUsersModule,
    SupportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AdminJwtGuard },
    { provide: APP_GUARD, useClass: AdminPermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AdminExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, IpAllowlistMiddleware).forRoutes('*')
  }
}
