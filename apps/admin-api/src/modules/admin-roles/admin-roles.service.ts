import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { RedisService } from '@/common/redis/redis.service'
import { adminPermissionsCacheKey } from '@/common/permissions/cache-keys'
import {
  ADMIN_PERMISSIONS,
  isSuperAdminOnlyPermission,
  isValidPermission,
  RESERVED_ROLE_NAMES,
} from '@/common/permissions/admin-permissions'
import {
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
} from '@/common/exceptions/app.exception'
import { AdminRole } from '@/entities/admin-role.entity'
import { AdminRolePermission } from '@/entities/admin-role-permission.entity'
import { AdminUser } from '@/entities/admin-user.entity'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'
import { RolePermissionDto } from './dto/role-permission.dto'

@Injectable()
export class AdminRolesService {
  constructor(
    @InjectRepository(AdminRole) private readonly rolesRepo: Repository<AdminRole>,
    @InjectRepository(AdminRolePermission) private readonly permsRepo: Repository<AdminRolePermission>,
    @InjectRepository(AdminUser) private readonly usersRepo: Repository<AdminUser>,
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  /** The full permission catalog — used by the role-editor UI. */
  getPermissionCatalog() {
    return { permissions: ADMIN_PERMISSIONS }
  }

  async listRoles() {
    const roles = await this.rolesRepo.find({ relations: ['permissions'], order: { createdAt: 'ASC' } })
    const counts = await this.memberCounts()
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      isSystemRole: role.isSystemRole,
      permissions: (role.permissions ?? []).map((p) => ({ permission: p.permission, scope: p.scope ?? null })),
      memberCount: counts.get(role.id) ?? 0,
      createdBy: role.createdBy ?? null,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }))
  }

  async createRole(dto: CreateRoleDto, createdBy: string) {
    const name = dto.name.trim()
    if (RESERVED_ROLE_NAMES.includes(name.toUpperCase())) {
      throw new AppConflictException(`"${name}" is a reserved system role name.`, 'RESERVED_ROLE_NAME')
    }
    const existing = await this.rolesRepo.findOne({ where: { name } })
    if (existing) {
      throw new AppConflictException(`A role named "${name}" already exists.`, 'ROLE_NAME_TAKEN')
    }
    this.assertPermissionsAssignable(dto.permissions)

    const role = await this.dataSource.transaction(async (manager) => {
      const created = await manager.getRepository(AdminRole).save(
        manager.getRepository(AdminRole).create({
          name,
          description: dto.description ?? null,
          isSystemRole: false,
          createdBy,
        }),
      )
      await this.replacePermissions(manager.getRepository(AdminRolePermission), created.id, dto.permissions)
      return created
    })

    return this.getRoleById(role.id)
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.rolesRepo.findOne({ where: { id } })
    if (!role) throw new AppNotFoundException('Role not found.', 'ROLE_NOT_FOUND')

    if (dto.name !== undefined && dto.name.trim() !== role.name) {
      if (role.isSystemRole) {
        throw new AppForbiddenException('System role names cannot be changed.', 'SYSTEM_ROLE_IMMUTABLE_NAME')
      }
      const taken = await this.rolesRepo.findOne({ where: { name: dto.name.trim() } })
      if (taken && taken.id !== id) {
        throw new AppConflictException(`A role named "${dto.name.trim()}" already exists.`, 'ROLE_NAME_TAKEN')
      }
      if (RESERVED_ROLE_NAMES.includes(dto.name.trim().toUpperCase())) {
        throw new AppConflictException(`"${dto.name.trim()}" is a reserved system role name.`, 'RESERVED_ROLE_NAME')
      }
      role.name = dto.name.trim()
    }
    if (dto.description !== undefined) role.description = dto.description

    if (dto.permissions) this.assertPermissionsAssignable(dto.permissions)

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AdminRole).save(role)
      if (dto.permissions) {
        await this.replacePermissions(manager.getRepository(AdminRolePermission), id, dto.permissions)
      }
    })

    // Permission changes take effect within ~1h via token refresh; clear the cache now
    // so the next refresh recomputes from the DB immediately.
    await this.invalidateMembersCache(id)

    return this.getRoleById(id)
  }

  async deleteRole(id: string) {
    const role = await this.rolesRepo.findOne({ where: { id } })
    if (!role) throw new AppNotFoundException('Role not found.', 'ROLE_NOT_FOUND')
    if (role.isSystemRole) {
      throw new AppForbiddenException('System roles cannot be deleted.', 'SYSTEM_ROLE_UNDELETABLE')
    }

    const members = await this.usersRepo.find({ where: { adminRoleId: id }, select: ['id', 'name', 'email'] })
    if (members.length > 0) {
      throw new AppConflictException(
        'Cannot delete a role with assigned admins. Reassign them first.',
        'ROLE_HAS_MEMBERS',
        { members: members.map((m) => ({ id: m.id, name: m.name, email: m.email })) },
      )
    }

    await this.rolesRepo.delete(id) // cascades to admin_role_permissions
    return { status: 'deleted' as const }
  }

  // ---- internals -----------------------------------------------------------

  private async getRoleById(id: string) {
    const role = await this.rolesRepo.findOne({ where: { id }, relations: ['permissions'] })
    if (!role) throw new AppNotFoundException('Role not found.', 'ROLE_NOT_FOUND')
    const counts = await this.memberCounts()
    return {
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      isSystemRole: role.isSystemRole,
      permissions: (role.permissions ?? []).map((p) => ({ permission: p.permission, scope: p.scope ?? null })),
      memberCount: counts.get(role.id) ?? 0,
      createdBy: role.createdBy ?? null,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }
  }

  private assertPermissionsAssignable(permissions: RolePermissionDto[]) {
    const seen = new Set<string>()
    for (const p of permissions) {
      if (!isValidPermission(p.permission)) {
        throw new AppConflictException(`Unknown permission: "${p.permission}".`, 'UNKNOWN_PERMISSION', {
          permission: p.permission,
        })
      }
      if (isSuperAdminOnlyPermission(p.permission)) {
        throw new AppForbiddenException(
          `"${p.permission}" can only be held by SUPER_ADMIN and cannot be assigned to a role.`,
          'PERMISSION_SUPER_ADMIN_ONLY',
          { permission: p.permission },
        )
      }
      if (seen.has(p.permission)) {
        throw new AppConflictException(`Duplicate permission: "${p.permission}".`, 'DUPLICATE_PERMISSION', {
          permission: p.permission,
        })
      }
      seen.add(p.permission)
    }
  }

  private async replacePermissions(
    repo: Repository<AdminRolePermission>,
    roleId: string,
    permissions: RolePermissionDto[],
  ) {
    await repo.delete({ adminRoleId: roleId })
    if (permissions.length === 0) return
    const rows = permissions.map((p) =>
      repo.create({
        adminRoleId: roleId,
        permission: p.permission,
        scope: p.scope && (p.scope.city || p.scope.plan) ? p.scope : null,
      }),
    )
    await repo.save(rows)
  }

  private async memberCounts(): Promise<Map<string, number>> {
    const rows = await this.usersRepo
      .createQueryBuilder('u')
      .select('u.admin_role_id', 'roleId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.admin_role_id')
      .getRawMany<{ roleId: string; count: string }>()
    return new Map(rows.map((r) => [r.roleId, Number(r.count)]))
  }

  private async invalidateMembersCache(roleId: string) {
    const members = await this.usersRepo.find({ where: { adminRoleId: roleId }, select: ['id'] })
    await Promise.all(
      members.map((m) => this.redis.del(adminPermissionsCacheKey(m.id)).catch(() => undefined)),
    )
  }
}
