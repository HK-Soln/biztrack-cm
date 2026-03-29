import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { UsersModule } from '../users/users.module'
import { User } from '../../entities/user.entity'
import { RefreshToken } from '../../entities/refresh-token.entity'
import { VerificationCode } from '../../entities/verification-code.entity'
import { AuthUsersRepository } from './repositories/auth-users.repository'
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository'
import { VerificationCodesRepository } from './repositories/verification-codes.repository'
import type { AppConfig } from '@/config/configuration'
import { PasswordManager } from '@/common/security/password-manager'

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([User, RefreshToken, VerificationCode]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        secret: config.get<string>('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthUsersRepository,
    RefreshTokensRepository,
    VerificationCodesRepository,
    PasswordManager,
    AuthService,
    JwtStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
