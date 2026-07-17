import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { RequirePermission } from '@/common/decorators/require-permission.decorator'
import { AuditAction } from '@/common/decorators/audit-action.decorator'
import { CurrentAdmin } from '@/common/decorators/current-admin.decorator'
import type { AdminJwtPayload } from '@/common/auth/admin-jwt-payload'
import { AdminUsersService } from './admin-users.service'
import { CreateAdminUserDto } from './dto/create-admin-user.dto'
import { UpdateAdminUserDto } from './dto/update-admin-user.dto'

@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @RequirePermission('admin_users:view')
  list() {
    return this.usersService.list()
  }

  @Post()
  @RequirePermission('admin_users:manage')
  @AuditAction('ADMIN_USER_CREATED')
  create(@Body() dto: CreateAdminUserDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.usersService.create(dto, admin.sub)
  }

  @Patch(':id')
  @RequirePermission('admin_users:manage')
  @AuditAction('ADMIN_USER_UPDATED')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminUserDto) {
    return this.usersService.update(id, dto)
  }

  @Patch(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('admin_users:manage')
  @AuditAction('ADMIN_USER_DEACTIVATED')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.usersService.deactivate(id, admin.sub)
  }
}
