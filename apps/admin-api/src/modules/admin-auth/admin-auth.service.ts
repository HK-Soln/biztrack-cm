import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { v4 as uuidv4 } from 'uuid'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { AppConfig } from '@/config/configuration'
import { PasswordManager } from '@/common/security/password-manager'
import { RedisService } from '@/common/redis/redis.service'
import {
  AppForbiddenException,
  AppUnauthorizedException,
} from '@/common/exceptions/app.exception'
import type { AdminJwtPayload, PermissionScope } from '@/common/auth/admin-jwt-payload'
import { ALL_PERMISSIONS } from '@/common/permissions/admin-permissions'
import { adminPermissionsCacheKey } from '@/common/permissions/cache-keys'
import { AdminUser } from '@/entities/admin-user.entity'
import { AdminUsersRepository } from './repositories/admin-users.repository'
import { AdminRolePermissionsRepository } from './repositories/admin-role-permissions.repository'
import { AdminRefreshTokensRepository } from './repositories/admin-refresh-tokens.repository'

interface EffectivePermissions {
  permissions: string[]
  scopes: Record<string, PermissionScope>
}

export interface AdminProfile {
  id: string
  name: string
  email: string
  isSuperAdmin: boolean
  isActive: boolean
  mustChangePassword: boolean
  role: { id: string; name: string; isSystemRole: boolean } | null
  permissions: string[]
  scopes: Record<string, PermissionScope>
  lastLoginAt: Date | null
}

export interface AdminTokens {
  accessToken: string
  refreshToken: string
  expiresIn: string
}

@Injectable()
export class AdminAuthService {
  private readonly cacheTtlSeconds = 60 * 60 // 1h

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly jwt: JwtService,
    private readonly passwordManager: PasswordManager,
    private readonly redis: RedisService,
    private readonly adminsRepo: AdminUsersRepository,
    private readonly rolePermsRepo: AdminRolePermissionsRepository,
    private readonly refreshTokensRepo: AdminRefreshTokensRepository,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.adminsRepo.findByEmail(email, true)
    const genericError = new AppUnauthorizedException('Invalid email or password.', 'INVALID_CREDENTIALS')

    if (!admin || !admin.isActive) {
      // Run a dummy compare to reduce timing signal, then fail.
      await this.passwordManager.verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinv')
      throw genericError
    }

    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      throw new AppUnauthorizedException(
        'Account temporarily locked due to failed login attempts.',
        'ACCOUNT_LOCKED',
      )
    }

    const valid = await this.passwordManager.verifyPassword(password, admin.passwordHash)
    if (!valid) {
      await this.registerFailedAttempt(admin)
      throw genericError
    }

    // Success — reset lockout counters.
    admin.failedLoginAttempts = 0
    admin.lockedUntil = null
    admin.lastLoginAt = new Date()
    await this.adminsRepo.save(admin)

    const effective = await this.loadEffectivePermissions(admin)
    const tokens = await this.issueTokens(admin, effective)

    return {
      tokens,
      admin: this.toProfile(admin, effective),
    }
  }

  async refresh(rawToken: string) {
    const { tokenId } = this.parseRefreshToken(rawToken)
    const stored = await this.refreshTokensRepo.findByTokenId(tokenId)
    const invalid = new AppUnauthorizedException('Invalid refresh token.', 'INVALID_REFRESH_TOKEN')

    if (!stored || stored.expiresAt < new Date()) throw invalid
    if (stored.revokedAt) throw invalid

    // Reuse detection: a token used twice ⇒ revoke the entire family.
    if (stored.usedAt) {
      await this.refreshTokensRepo.updateByFamilyId(stored.familyId, { revokedAt: new Date() })
      this.logger.warn('Admin refresh token reuse detected — family revoked', 'AdminAuthService', {
        familyId: stored.familyId,
        adminUserId: stored.adminUserId,
      })
      throw invalid
    }

    const valid = await this.passwordManager.verifyToken(rawToken, stored.tokenHash)
    if (!valid) throw invalid

    // Mark the old token consumed (one-time use).
    await this.refreshTokensRepo.update(stored.id, { usedAt: new Date() })

    const admin = await this.adminsRepo.findByIdWithRole(stored.adminUserId)
    if (!admin || !admin.isActive) throw invalid

    const effective = await this.loadEffectivePermissions(admin)
    const tokens = await this.issueTokens(admin, effective, stored.familyId)

    return { tokens, admin: this.toProfile(admin, effective) }
  }

  async logout(adminUserId: string, rawToken?: string) {
    if (rawToken) {
      const { tokenId } = this.parseRefreshToken(rawToken)
      await this.refreshTokensRepo.updateByTokenId(tokenId, { revokedAt: new Date() })
    } else {
      await this.refreshTokensRepo.updateByAdminUserId(adminUserId, { revokedAt: new Date() })
    }
    await this.redis.del(adminPermissionsCacheKey(adminUserId)).catch(() => undefined)
    return { status: 'logged_out' as const }
  }

  async me(adminUserId: string): Promise<AdminProfile> {
    const admin = await this.adminsRepo.findByIdWithRole(adminUserId)
    if (!admin || !admin.isActive) {
      throw new AppUnauthorizedException('Unauthorized', 'UNAUTHORIZED')
    }
    const effective = await this.loadEffectivePermissions(admin)
    return this.toProfile(admin, effective)
  }

  async changePassword(adminUserId: string, currentPassword: string, newPassword: string) {
    const admin = await this.adminsRepo.findByIdWithRole(adminUserId)
    if (!admin || !admin.isActive) throw new AppUnauthorizedException('Unauthorized', 'UNAUTHORIZED')

    const ok = await this.passwordManager.verifyPassword(currentPassword, admin.passwordHash)
    if (!ok) throw new AppForbiddenException('Current password is incorrect.', 'INVALID_CREDENTIALS')

    admin.passwordHash = await this.passwordManager.hashPassword(newPassword)
    admin.mustChangePassword = false
    await this.adminsRepo.save(admin)

    // Invalidate all existing sessions so the new password takes effect everywhere.
    await this.refreshTokensRepo.updateByAdminUserId(adminUserId, { revokedAt: new Date() })
    await this.redis.del(adminPermissionsCacheKey(adminUserId)).catch(() => undefined)

    return { status: 'password_changed' as const }
  }

  // ---- internals -----------------------------------------------------------

  private async registerFailedAttempt(admin: AdminUser) {
    const max = this.config.get('ADMIN_LOGIN_MAX_ATTEMPTS', { infer: true }) ?? 10
    const lockMinutes = this.config.get('ADMIN_LOGIN_LOCK_MINUTES', { infer: true }) ?? 60
    admin.failedLoginAttempts = (admin.failedLoginAttempts ?? 0) + 1
    if (admin.failedLoginAttempts >= max) {
      admin.lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000)
      admin.failedLoginAttempts = 0
    }
    await this.adminsRepo.save(admin)
  }

  private async loadEffectivePermissions(admin: AdminUser): Promise<EffectivePermissions> {
    if (admin.isSuperAdmin) {
      return { permissions: [...ALL_PERMISSIONS], scopes: {} }
    }
    const rows = await this.rolePermsRepo.findByRole(admin.adminRoleId)
    const permissions: string[] = []
    const scopes: Record<string, PermissionScope> = {}
    for (const row of rows) {
      permissions.push(row.permission)
      if (row.scope) scopes[row.permission] = row.scope
    }
    // Cache for downstream use (e.g. refresh, future invalidation).
    await this.redis
      .setex(adminPermissionsCacheKey(admin.id), this.cacheTtlSeconds, JSON.stringify({ permissions, scopes }))
      .catch(() => undefined)
    return { permissions, scopes }
  }

  private async issueTokens(
    admin: AdminUser,
    effective: EffectivePermissions,
    familyId?: string,
  ): Promise<AdminTokens> {
    const payload: AdminJwtPayload = {
      sub: admin.id,
      role: admin.role?.name ?? 'UNKNOWN',
      isSuperAdmin: admin.isSuperAdmin,
      permissions: effective.permissions,
      scopes: effective.scopes,
    }
    const expiresIn = this.config.get('ADMIN_ACCESS_TOKEN_TTL', { infer: true }) ?? '1h'
    const accessToken = await this.jwt.signAsync(payload, { expiresIn })
    const refreshToken = await this.generateRefreshToken(admin.id, familyId)
    return { accessToken, refreshToken, expiresIn }
  }

  private async generateRefreshToken(adminUserId: string, familyId?: string): Promise<string> {
    const tokenId = uuidv4()
    const secret = uuidv4().replace(/-/g, '')
    const rawToken = `${tokenId}.${secret}`
    const tokenHash = await this.passwordManager.hashToken(rawToken)

    const ttlHours = this.config.get('ADMIN_REFRESH_TOKEN_TTL_HOURS', { infer: true }) ?? 8
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)

    await this.refreshTokensRepo.createOne({
      tokenId,
      tokenHash,
      familyId: familyId ?? uuidv4(),
      adminUserId,
      expiresAt,
    })
    return rawToken
  }

  private parseRefreshToken(raw: string): { tokenId: string } {
    const [tokenId] = (raw ?? '').split('.')
    if (!tokenId) {
      throw new AppUnauthorizedException('Invalid refresh token.', 'INVALID_REFRESH_TOKEN')
    }
    return { tokenId }
  }

  private toProfile(admin: AdminUser, effective: EffectivePermissions): AdminProfile {
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      isSuperAdmin: admin.isSuperAdmin,
      isActive: admin.isActive,
      mustChangePassword: admin.mustChangePassword,
      role: admin.role
        ? { id: admin.role.id, name: admin.role.name, isSystemRole: admin.role.isSystemRole }
        : null,
      permissions: effective.permissions,
      scopes: effective.scopes,
      lastLoginAt: admin.lastLoginAt ?? null,
    }
  }
}
