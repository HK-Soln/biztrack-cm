import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { AppConfig } from '@/config/configuration'
import { AdminJwtStrategy } from '@/common/guards/admin-jwt.strategy'
import { AdminUser } from '@/entities/admin-user.entity'
import { AdminRole } from '@/entities/admin-role.entity'
import { AdminRolePermission } from '@/entities/admin-role-permission.entity'
import { AdminRefreshToken } from '@/entities/admin-refresh-token.entity'
import { AdminAuthController } from './admin-auth.controller'
import { AdminAuthService } from './admin-auth.service'
import { AdminUsersRepository } from './repositories/admin-users.repository'
import { AdminRolePermissionsRepository } from './repositories/admin-role-permissions.repository'
import { AdminRefreshTokensRepository } from './repositories/admin-refresh-tokens.repository'
import { AdminTokenCleanupScheduler } from './admin-token-cleanup.scheduler'

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([AdminUser, AdminRole, AdminRolePermission, AdminRefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        secret: config.get('ADMIN_JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('ADMIN_ACCESS_TOKEN_TTL', { infer: true }) ?? '1h' },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [
    AdminAuthService,
    AdminJwtStrategy,
    AdminUsersRepository,
    AdminRolePermissionsRepository,
    AdminRefreshTokensRepository,
    AdminTokenCleanupScheduler,
  ],
  exports: [AdminAuthService, AdminUsersRepository, AdminRolePermissionsRepository],
})
export class AdminAuthModule {}
