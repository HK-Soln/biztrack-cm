import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { v4 as uuidv4 } from 'uuid'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { AuthNextStep, JwtPayload, PrefferedPhoneChannel, UserRole, VerificationChannel } from '@biztrack/types'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '../../logger/logger.module'
import { AuthUsersRepository } from './repositories/auth-users.repository'
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository'
import { VerificationCodesRepository } from './repositories/verification-codes.repository'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '@/config/configuration'
import { NodeEnv } from '@/config/configuration'
import { VerificationPurpose } from '@/entities/verification-code.entity'
import { IsNull } from 'typeorm'
import { randomInt } from 'crypto'
import { PasswordManager } from '@/common/security/password-manager'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppConflictException,
  AppInternalServerException,
  AppUnauthorizedException,
} from '@/common/exceptions/app-exceptions'
import { User } from '@/entities/user.entity'
import type { RequestLoginDto } from './dto/request-login.dto'

@Injectable()
export class AuthService {
  constructor(
    private usersRepo: AuthUsersRepository,
    private refreshTokensRepo: RefreshTokensRepository,
    private verificationCodesRepo: VerificationCodesRepository,
    private jwt: JwtService,
    private config: ConfigService<AppConfig>,
    private passwordManager: PasswordManager,
    @Inject(LOGGER) private logger: Logger,
  ) {
    logger.setContext('AuthService')
    logger.log('AuthService initialized')
  }

  async register(dto: RegisterDto) {
    const email = dto.email?.toLowerCase()
    const phone = dto.phone
    this.logger.debug('Register attempt', 'AuthService', { email, phone })

    try {
      if (email) {
        const existingEmail = await this.usersRepo.findOne({ where: { email } })
        if (existingEmail) {
          throw new AppConflictException('Email already in use', 'EMAIL_IN_USE')
        }
      }

      const existingPhone = await this.usersRepo.findOne({ where: { phone } })
      if (existingPhone) {
        throw new AppConflictException('Phone already in use', 'PHONE_IN_USE')
      }

      const passwordHash = dto.password ? await this.passwordManager.hashPassword(dto.password) : null
      const user = this.usersRepo.create({
        name: dto.name,
        email,
        phone,
        passwordHash,
        language: dto.language ?? 'fr',
        preferredPhoneChannel: dto.preferredPhoneChannel ?? PrefferedPhoneChannel.SMS,
      })
      await this.usersRepo.save(user)

      const verification = await this.createVerificationCode(
        user.id,
        VerificationChannel.PHONE,
        VerificationPurpose.VERIFY_PHONE,
      )

      this.logger.log('User registered', 'AuthService', { userId: user.id })
      return {
        nextStep: AuthNextStep.VERIFY_PHONE,
        verification: {
          channel: VerificationChannel.PHONE,
          delivery: user.preferredPhoneChannel,
          expiresAt: verification.expiresAt,
          code: this.shouldReturnOtp() ? verification.code : undefined,
        },
      }
    } catch (error) {
      this.handleServiceError('register', error, { email, phone })
    }
  }

  async login(dto: LoginDto) {
    this.logger.debug('Login attempt', 'AuthService', { email: dto.email, phone: dto.phone })

    try {
      const user = await this.getUserForLogin(dto.phone, dto.email)
      this.ensureUserActive(user)
      this.ensurePhoneVerified(user)
      this.ensureEmailVerifiedIfRequired(user)

      if (!user.passwordHash) {
        throw new AppBadRequestException('Password not configured', 'PASSWORD_NOT_CONFIGURED')
      }

      const valid = await this.passwordManager.verifyPassword(dto.password, user.passwordHash)
      if (!valid) throw new AppUnauthorizedException('Invalid credentials', 'INVALID_CREDENTIALS')

      const tokens = await this.generateTokens(
        user.id,
        user.email ?? undefined,
        user.phone ?? undefined,
        user.role as UserRole,
        user.businessId ?? undefined,
      )
      this.logger.log('User logged in', 'AuthService', { userId: user.id })
      return { user: this.sanitizeUser(user), tokens }
    } catch (error) {
      this.handleServiceError('login', error, { email: dto.email, phone: dto.phone })
    }
  }

  async requestLogin(dto: RequestLoginDto) {
    this.logger.debug('Request login', 'AuthService', { email: dto.email, phone: dto.phone })

    try {
      const user = await this.getUserForLogin(dto.phone, dto.email)
      this.ensureUserActive(user)
      const requestedEmail = dto.email?.toLowerCase()

      if (requestedEmail) {
        if (user.email && user.email !== requestedEmail) {
          throw new AppBadRequestException('Email does not match account', 'EMAIL_MISMATCH')
        }

        if (!user.email) {
          const existingEmail = await this.usersRepo.findOne({ where: { email: requestedEmail } })
          if (existingEmail) {
            throw new AppConflictException('Email already in use', 'EMAIL_IN_USE')
          }

          await this.usersRepo.update(user.id, { email: requestedEmail, isEmailVerified: false })
          user.email = requestedEmail
          user.isEmailVerified = false
        }
      }

      if (!user.isPhoneVerified) {
        const verification = await this.createVerificationCode(
          user.id,
          VerificationChannel.PHONE,
          VerificationPurpose.VERIFY_PHONE,
        )

        return {
          nextStep: AuthNextStep.VERIFY_PHONE,
          verification: {
            channel: VerificationChannel.PHONE,
            delivery: user.preferredPhoneChannel,
            expiresAt: verification.expiresAt,
            code: this.shouldReturnOtp() ? verification.code : undefined,
          },
        }
      }

      if (user.email && !user.isEmailVerified) {
        const verification = await this.createVerificationCode(
          user.id,
          VerificationChannel.EMAIL,
          VerificationPurpose.VERIFY_EMAIL,
        )

        return {
          nextStep: AuthNextStep.VERIFY_EMAIL,
          verification: {
            channel: VerificationChannel.EMAIL,
            expiresAt: verification.expiresAt,
            code: this.shouldReturnOtp() ? verification.code : undefined,
          },
        }
      }

      if (user.passwordHash) {
        return { nextStep: AuthNextStep.PASSWORD_REQUIRED }
      }

      return this.createLoginOtp(user)
    } catch (error) {
      this.handleServiceError('requestLogin', error, { email: dto.email, phone: dto.phone })
    }
  }

  async loginWithOtp(phone: string, code: string) {
    this.logger.debug('Login with OTP attempt', 'AuthService', { phone })

    try {
      const user = await this.usersRepo.findOne({ where: { phone } })
      if (!user || !user.isActive) {
        throw new AppUnauthorizedException('Invalid credentials', 'INVALID_CREDENTIALS')
      }

      if (!user.isPhoneVerified) {
        return this.verifyPhone(phone, code)
      }

      this.ensureEmailVerifiedIfRequired(user)
      await this.verifyCodeOrThrow(user.id, VerificationChannel.PHONE, VerificationPurpose.LOGIN, code)

      const tokens = await this.generateTokens(
        user.id,
        user.email ?? undefined,
        user.phone ?? undefined,
        user.role as UserRole,
        user.businessId ?? undefined,
      )
      this.logger.log('User logged in (otp)', 'AuthService', { userId: user.id })
      return { nextStep: AuthNextStep.LOGIN_COMPLETE, displayName: user.name, tokens }
    } catch (error) {
      this.handleServiceError('loginWithOtp', error, { phone })
    }
  }

  async verifyPhone(phone: string, code: string) {
    this.logger.debug('Verify phone attempt', 'AuthService', { phone })

    try {
      const user = await this.usersRepo.findOne({ where: { phone } })
      if (!user || !user.isActive) {
        throw new AppUnauthorizedException('Invalid credentials', 'INVALID_CREDENTIALS')
      }

      await this.verifyCodeOrThrow(user.id, VerificationChannel.PHONE, VerificationPurpose.VERIFY_PHONE, code)

      if (!user.isPhoneVerified) {
        await this.usersRepo.update(user.id, { isPhoneVerified: true })
      }
      user.isPhoneVerified = true

      if (user.email && !user.isEmailVerified) {
        const verification = await this.createVerificationCode(
          user.id,
          VerificationChannel.EMAIL,
          VerificationPurpose.VERIFY_EMAIL,
        )

        return {
          nextStep: AuthNextStep.VERIFY_EMAIL,
          verification: {
            channel: VerificationChannel.EMAIL,
            expiresAt: verification.expiresAt,
            code: this.shouldReturnOtp() ? verification.code : undefined,
          },
        }
      }

      if (user.passwordHash) {
        return { nextStep: AuthNextStep.PASSWORD_REQUIRED }
      }

      return this.createLoginOtp(user)
    } catch (error) {
      this.handleServiceError('verifyPhone', error, { phone })
    }
  }

  async verifyEmail(email: string, code: string) {
    this.logger.debug('Verify email attempt', 'AuthService', { email })

    try {
      const user = await this.usersRepo.findOne({ where: { email } })
      if (!user || !user.isActive) {
        throw new AppUnauthorizedException('Invalid credentials', 'INVALID_CREDENTIALS')
      }

      await this.verifyCodeOrThrow(user.id, VerificationChannel.EMAIL, VerificationPurpose.VERIFY_EMAIL, code)

      if (!user.isEmailVerified) {
        await this.usersRepo.update(user.id, { isEmailVerified: true })
      }
      user.isEmailVerified = true

      this.ensurePhoneVerified(user)

      if (user.passwordHash) {
        return { nextStep: AuthNextStep.PASSWORD_REQUIRED }
      }

      return this.createLoginOtp(user)
    } catch (error) {
      this.handleServiceError('verifyEmail', error, { email })
    }
  }

  async refreshTokens(refreshToken: string) {
    this.logger.debug('Refresh tokens attempt', 'AuthService')

    try {
      const stored = await this.refreshTokensRepo.findOne({
        where: { token: refreshToken },
        relations: ['user'],
      })

      if (!stored || stored.expiresAt < new Date()) {
        throw new AppUnauthorizedException('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
      }

      // Rotate refresh token
      await this.refreshTokensRepo.delete({ id: stored.id })

      const tokens = await this.generateTokens(
        stored!.user!.id,
        stored!.user!.email ?? undefined,
        stored!.user!.phone ?? undefined,
        stored!.user!.role as UserRole,
        stored!.user!.businessId ?? undefined,
      )
      return { tokens }
    } catch (error) {
      this.handleServiceError('refreshTokens', error)
    }
  }

  async logout(userId: string, refreshToken?: string) {
    this.logger.debug('Logout attempt', 'AuthService', { userId })

    try {
      if (refreshToken) {
        await this.refreshTokensRepo.delete({ token: refreshToken })
      } else {
        await this.refreshTokensRepo.delete({ userId })
      }
    } catch (error) {
      this.handleServiceError('logout', error, { userId })
    }
  }

  private async generateTokens(
    userId: string,
    email: string | undefined,
    phone: string | undefined,
    role: UserRole,
    businessId?: string,
  ) {
    const payload: JwtPayload = { sub: userId, email, phone, role, businessId }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload),
      this.generateRefreshToken(userId),
    ])

    return { accessToken, refreshToken }
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = uuidv4()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const refreshToken = this.refreshTokensRepo.create({ token, userId, expiresAt })
    await this.refreshTokensRepo.save(refreshToken)
    return token
  }

  private async createVerificationCode(
    userId: string,
    channel: VerificationChannel,
    purpose: VerificationPurpose,
  ) {
    await this.verificationCodesRepo.delete({ userId, channel, purpose, usedAt: IsNull() })

    const code = this.generateOtp()
    const codeHash = await this.passwordManager.hashOtp(code)
    const expiresAt = new Date(Date.now() + this.getOtpTtlMinutes() * 60 * 1000)

    const record = this.verificationCodesRepo.create({
      userId,
      channel,
      purpose,
      codeHash,
      expiresAt,
    })
    await this.verificationCodesRepo.save(record)

    return { code, expiresAt }
  }

  private async verifyCodeOrThrow(
    userId: string,
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    code: string,
  ) {
    const record = await this.verificationCodesRepo.findOne({
      where: { userId, channel, purpose, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    })

    if (!record || record.expiresAt < new Date()) {
      throw new AppBadRequestException('Invalid or expired code', 'INVALID_CODE')
    }

    const valid = await this.passwordManager.verifyOtp(code, record.codeHash)
    if (!valid) throw new AppBadRequestException('Invalid or expired code', 'INVALID_CODE')

    await this.verificationCodesRepo.update(record.id, { usedAt: new Date() })
  }

  private generateOtp(): string {
    return String(randomInt(100000, 999999))
  }

  private getOtpTtlMinutes(): number {
    return this.config.get('OTP_TTL_MINUTES', { infer: true }) || 10
  }

  private shouldReturnOtp(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) !== NodeEnv.PRODUCTION
  }

  private async createLoginOtp(user: User) {
    const verification = await this.createVerificationCode(
      user.id,
      VerificationChannel.PHONE,
      VerificationPurpose.LOGIN,
    )

    return {
      nextStep: AuthNextStep.CONFIRM_LOGIN,
      verification: {
        channel: VerificationChannel.PHONE,
        delivery: user.preferredPhoneChannel,
        expiresAt: verification.expiresAt,
        code: this.shouldReturnOtp() ? verification.code : undefined,
      },
    }
  }

  private sanitizeUser(user: User) {
    const { passwordHash, ...rest } = user
    return rest
  }

  private async getUserForLogin(phone?: string, email?: string): Promise<User> {
    if (!phone && !email) {
      throw new AppBadRequestException('Phone or email is required', 'LOGIN_IDENTIFIER_REQUIRED')
    }

    const lookupEmail = email?.toLowerCase()
    const user = phone
      ? await this.usersRepo.findOne({ where: { phone } })
      : await this.usersRepo.findOne({ where: { email: lookupEmail } })

    if (!user) {
      throw new AppUnauthorizedException('Invalid credentials', 'INVALID_CREDENTIALS')
    }

    return user
  }

  private ensureUserActive(user: User) {
    if (!user.isActive) {
      throw new AppUnauthorizedException('Account is deactivated', 'ACCOUNT_DEACTIVATED')
    }
  }

  private ensurePhoneVerified(user: User) {
    if (!user.isPhoneVerified) {
      throw new AppUnauthorizedException('Phone not verified', 'PHONE_NOT_VERIFIED')
    }
  }

  private ensureEmailVerifiedIfRequired(user: User) {
    if (user.email && !user.isEmailVerified) {
      throw new AppUnauthorizedException('Email not verified', 'EMAIL_NOT_VERIFIED')
    }
  }

  private handleServiceError(action: string, error: unknown, metadata?: LogMetadata): never {
    if (error instanceof AppException) {
      this.logger.warn('AuthService error', 'AuthService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('AuthService unexpected error', 'AuthService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException('Something went wrong', 'AUTH_SERVICE_ERROR', {
      action,
    })
  }
}
