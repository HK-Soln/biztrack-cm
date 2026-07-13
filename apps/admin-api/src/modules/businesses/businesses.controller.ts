import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { RequirePermission } from '@/common/decorators/require-permission.decorator'
import { AuditAction } from '@/common/decorators/audit-action.decorator'
import { CurrentAdmin, PermissionScopeParam } from '@/common/decorators/current-admin.decorator'
import type { AdminJwtPayload, PermissionScope } from '@/common/auth/admin-jwt-payload'
import { BusinessesService } from './businesses.service'
import { BusinessFiltersDto } from './dto/business-filters.dto'
import { SetBusinessStatusDto } from './dto/set-business-status.dto'
import { CreateOverrideDto } from './dto/create-override.dto'

@Controller({ path: 'admin/businesses', version: '1' })
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get()
  @RequirePermission('businesses:view')
  list(
    @Query() filters: BusinessFiltersDto,
    @PermissionScopeParam() scope: PermissionScope | null,
  ) {
    return this.businessesService.findAll(filters, scope)
  }

  @Get(':id')
  @RequirePermission('businesses:view')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @PermissionScopeParam() scope: PermissionScope | null,
  ) {
    return this.businessesService.findOne(id, scope)
  }

  @Patch(':id/status')
  @RequirePermission('businesses:suspend')
  @AuditAction('BUSINESS_STATUS_UPDATED')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBusinessStatusDto,
    @PermissionScopeParam() scope: PermissionScope | null,
  ) {
    return this.businessesService.setStatus(id, dto.status, dto.reason, scope)
  }

  @Post(':id/override')
  @RequirePermission('businesses:override_permissions')
  @AuditAction('BUSINESS_OVERRIDE_GRANTED')
  grantOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOverrideDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @PermissionScopeParam() scope: PermissionScope | null,
  ) {
    return this.businessesService.grantOverride(id, dto, admin.sub, scope)
  }

  @Delete(':id/override/:overrideId')
  @HttpCode(200)
  @RequirePermission('businesses:override_permissions')
  @AuditAction('BUSINESS_OVERRIDE_REVOKED')
  revokeOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
    @PermissionScopeParam() scope: PermissionScope | null,
  ) {
    return this.businessesService.revokeOverride(id, overrideId, scope)
  }
}
