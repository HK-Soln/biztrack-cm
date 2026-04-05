import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { RequestLoginOtpDto } from './dto/request-login-otp.dto'
import { RequestLoginDto } from './dto/request-login.dto'
import { LoginOtpDto } from './dto/login-otp.dto'
import { VerifyPhoneDto } from './dto/verify-phone.dto'
import { VerifyEmailDto } from './dto/verify-email.dto'
import { ResendOtpDto } from './dto/resend-otp.dto'
import { SelectBusinessDto } from './dto/select-business.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'
import { AuthRateLimitGuard } from '@/common/guards/auth-rate-limit.guard'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Login with phone/email + password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Post('request-login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Request login (phone or email)' })
  requestLogin(@Body() dto: RequestLoginDto) {
    return this.authService.requestLogin(dto)
  }

  @Post('request-login-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Request a login OTP via phone' })
  requestLoginOtp(@Body() dto: RequestLoginOtpDto) {
    return this.authService.requestLogin({ identifier: dto.phone })
  }

  @Post('login-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Login with phone + OTP' })
  loginWithOtp(@Body() dto: LoginOtpDto) {
    return this.authService.loginWithOtp(dto.identifier, dto.code)
  }

  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Verify phone number with OTP' })
  verifyPhone(@Body() dto: VerifyPhoneDto) {
    return this.authService.verifyPhone(dto.phone, dto.code, dto.inviteToken)
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Verify email address with OTP' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code, dto.inviteToken)
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken)
  }

  @Post('select-business')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select business context (Phase 1 -> Phase 2)' })
  selectBusiness(@CurrentUser() user: JwtPayload, @Body() dto: SelectBusinessDto) {
    return this.authService.selectBusiness(user.sub, dto.businessId)
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Resend OTP (phone/email/login)' })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto)
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (revoke refresh token)' })
  logout(@CurrentUser() user: JwtPayload, @Body() body: { refreshToken?: string }) {
    return this.authService.logout(user.sub, body.refreshToken)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user from JWT payload' })
  me(@CurrentUser() user: JwtPayload) {
    return user
  }
}
