import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Public } from '@/common/decorators/public.decorator'
import { CurrentAdmin } from '@/common/decorators/current-admin.decorator'
import { AuditAction } from '@/common/decorators/audit-action.decorator'
import type { AdminJwtPayload } from '@/common/auth/admin-jwt-payload'
import { AdminAuthService } from './admin-auth.service'
import { AdminLoginDto } from './dto/admin-login.dto'
import { AdminRefreshDto } from './dto/admin-refresh.dto'
import { AdminChangePasswordDto } from './dto/admin-change-password.dto'

@Controller({ path: 'admin/auth', version: '1' })
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ medium: { limit: 10, ttl: 900 } })
  login(@Body() dto: AdminLoginDto) {
    return this.authService.login(dto.email, dto.password)
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ medium: { limit: 30, ttl: 900 } })
  refresh(@Body() dto: AdminRefreshDto) {
    return this.authService.refresh(dto.refreshToken ?? '')
  }

  @Post('logout')
  @HttpCode(200)
  @AuditAction('ADMIN_LOGOUT')
  logout(@CurrentAdmin() admin: AdminJwtPayload, @Body() dto: AdminRefreshDto) {
    return this.authService.logout(admin.sub, dto.refreshToken)
  }

  @Get('me')
  me(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.authService.me(admin.sub)
  }

  @Post('change-password')
  @HttpCode(200)
  @AuditAction('ADMIN_PASSWORD_CHANGED')
  changePassword(@CurrentAdmin() admin: AdminJwtPayload, @Body() dto: AdminChangePasswordDto) {
    return this.authService.changePassword(admin.sub, dto.currentPassword, dto.newPassword)
  }
}
