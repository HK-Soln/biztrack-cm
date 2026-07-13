import {
  Body,
  Controller,
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
import { ClientUsersService } from './client-users.service'
import { ClientUserFiltersDto } from './dto/client-user-filters.dto'
import { SetUserStatusDto } from './dto/set-user-status.dto'
import { ResendOtpDto } from './dto/resend-otp.dto'

@Controller({ path: 'admin/users/clients', version: '1' })
export class ClientUsersController {
  constructor(private readonly clientUsersService: ClientUsersService) {}

  @Get()
  @RequirePermission('users:view')
  list(@Query() filters: ClientUserFiltersDto) {
    return this.clientUsersService.findAll(filters)
  }

  @Get(':id')
  @RequirePermission('users:view')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientUsersService.findOne(id)
  }

  @Patch(':id/status')
  @RequirePermission('users:suspend')
  @AuditAction('USER_STATUS_UPDATED')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetUserStatusDto) {
    return this.clientUsersService.setStatus(id, dto.status, dto.reason)
  }

  @Post(':id/resend-otp')
  @HttpCode(200)
  @RequirePermission('users:resend_otp')
  @AuditAction('USER_OTP_RESENT')
  resendOtp(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResendOtpDto) {
    return this.clientUsersService.resendOtp(id, dto)
  }
}
