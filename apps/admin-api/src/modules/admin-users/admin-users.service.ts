import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PasswordManager } from '@/common/security/password-manager'
import { RedisService } from '@/common/redis/redis.service'
import { adminPermissionsCacheKey } from '@/common/permissions/cache-keys'
import {
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
} from '@/common/exceptions/app.exception'
import { AdminUser } from '@/entities/admin-user.entity'
import { AdminRole } from '@/entities/admin-role.entity'
import { AdminRefreshToken } from '@/entities/admin-refresh-token.entity'
import { CreateAdminUserDto } from './dto/create-admin-user.dto'
import { UpdateAdminUserDto } from './dto/update-admin-user.dto'

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(AdminUser) private readonly usersRepo: Repository<AdminUser>,
    @InjectRepository(AdminRole) private readonly rolesRepo: Repository<AdminRole>,
    @InjectRepository(AdminRefreshToken) private readonly refreshRepo: Repository<AdminRefreshToken>,
    private readonly passwordManager: PasswordManager,
    private readonly redis: RedisService,
  ) {}

  async list() {
    const admins = await this.usersRepo.find({ relations: ['role'], order: { createdAt: 'ASC' } })
    return admins.map((a) => this.toSummary(a))
  }

  async create(dto: CreateAdminUserDto, createdBy: string) {
    const email = dto.email.toLowerCase()
    const existing = await this.usersRepo.findOne({ where: { email } })
    if (existing) {
      throw new AppConflictException('An admin with this email already exists.', 'ADMIN_EMAIL_TAKEN')
    }
    const role = await this.rolesRepo.findOne({ where: { id: dto.adminRoleId } })
    if (!role) throw new AppNotFoundException('Role not found.', 'ROLE_NOT_FOUND')

    const admin = this.usersRepo.create({
      name: dto.name.trim(),
      email,
      passwordHash: await this.passwordManager.hashPassword(dto.password),
      adminRoleId: role.id,
      isActive: true,
      isSuperAdmin: false, // never settable via the API
      mustChangePassword: true, // forced change on first login
      createdBy,
    })
    const saved = await this.usersRepo.save(admin)
    // TODO(notifications): send a welcome email with first-login instructions.
    return this.getById(saved.id)
  }

  async update(id: string, dto: UpdateAdminUserDto) {
    // Load WITHOUT the `role` relation: a stale relation object would override the
    // scalar admin_role_id FK on save and silently revert a role change.
    const admin = await this.usersRepo.findOne({ where: { id } })
    if (!admin) throw new AppNotFoundException('Admin not found.', 'ADMIN_NOT_FOUND')

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase()
      if (email !== admin.email) {
        const taken = await this.usersRepo.findOne({ where: { email } })
        if (taken && taken.id !== id) {
          throw new AppConflictException('An admin with this email already exists.', 'ADMIN_EMAIL_TAKEN')
        }
        admin.email = email
      }
    }
    if (dto.name !== undefined) admin.name = dto.name.trim()

    let roleChanged = false
    if (dto.adminRoleId !== undefined && dto.adminRoleId !== admin.adminRoleId) {
      const role = await this.rolesRepo.findOne({ where: { id: dto.adminRoleId } })
      if (!role) throw new AppNotFoundException('Role not found.', 'ROLE_NOT_FOUND')
      admin.adminRoleId = role.id
      roleChanged = true
    }

    await this.usersRepo.save(admin)

    if (roleChanged) {
      // New permissions apply on the next token refresh (≤1h); clear cache immediately.
      await this.redis.del(adminPermissionsCacheKey(id)).catch(() => undefined)
    }

    return this.getById(id)
  }

  async deactivate(id: string, actingAdminId: string) {
    if (id === actingAdminId) {
      throw new AppForbiddenException('You cannot deactivate your own account.', 'CANNOT_DEACTIVATE_SELF')
    }
    const admin = await this.usersRepo.findOne({ where: { id } })
    if (!admin) throw new AppNotFoundException('Admin not found.', 'ADMIN_NOT_FOUND')
    if (admin.isSuperAdmin) {
      throw new AppForbiddenException('SUPER_ADMIN accounts cannot be deactivated via the API.', 'CANNOT_DEACTIVATE_SUPER_ADMIN')
    }

    admin.isActive = false
    await this.usersRepo.save(admin)

    // Revoke all sessions and drop the cached permissions.
    await this.refreshRepo.update({ adminUserId: id }, { revokedAt: new Date() })
    await this.redis.del(adminPermissionsCacheKey(id)).catch(() => undefined)

    return this.getById(id)
  }

  private async getById(id: string) {
    const admin = await this.usersRepo.findOne({ where: { id }, relations: ['role'] })
    if (!admin) throw new AppNotFoundException('Admin not found.', 'ADMIN_NOT_FOUND')
    return this.toSummary(admin)
  }

  private toSummary(a: AdminUser) {
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      isActive: a.isActive,
      isSuperAdmin: a.isSuperAdmin,
      mustChangePassword: a.mustChangePassword,
      role: a.role ? { id: a.role.id, name: a.role.name, isSystemRole: a.role.isSystemRole } : null,
      lastLoginAt: a.lastLoginAt ?? null,
      createdBy: a.createdBy ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }
  }
}
