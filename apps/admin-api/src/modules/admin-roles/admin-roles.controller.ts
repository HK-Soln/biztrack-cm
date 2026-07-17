import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { RequirePermission } from '@/common/decorators/require-permission.decorator'
import { AuditAction } from '@/common/decorators/audit-action.decorator'
import { CurrentAdmin } from '@/common/decorators/current-admin.decorator'
import type { AdminJwtPayload } from '@/common/auth/admin-jwt-payload'
import { AdminRolesService } from './admin-roles.service'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'

@Controller({ path: 'admin/roles', version: '1' })
export class AdminRolesController {
  constructor(private readonly rolesService: AdminRolesService) {}

  @Get()
  @RequirePermission('admin_roles:view')
  list() {
    return this.rolesService.listRoles()
  }

  @Get('permissions')
  @RequirePermission('admin_roles:view')
  permissions() {
    return this.rolesService.getPermissionCatalog()
  }

  @Post()
  @RequirePermission('admin_roles:manage')
  @AuditAction('ADMIN_ROLE_CREATED')
  create(@Body() dto: CreateRoleDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.rolesService.createRole(dto, admin.sub)
  }

  @Patch(':id')
  @RequirePermission('admin_roles:manage')
  @AuditAction('ADMIN_ROLE_UPDATED')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(id, dto)
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('admin_roles:manage')
  @AuditAction('ADMIN_ROLE_DELETED')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.deleteRole(id)
  }
}
