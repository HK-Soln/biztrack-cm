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
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone/email + password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Post('request-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request login (phone or email)' })
  requestLogin(@Body() dto: RequestLoginDto) {
    return this.authService.requestLogin(dto)
  }

  @Post('request-login-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a login OTP via phone' })
  requestLoginOtp(@Body() dto: RequestLoginOtpDto) {
    return this.authService.requestLogin({ phone: dto.phone })
  }

  @Post('login-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone + OTP' })
  loginWithOtp(@Body() dto: LoginOtpDto) {
    return this.authService.loginWithOtp(dto.phone, dto.code)
  }

  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify phone number with OTP' })
  verifyPhone(@Body() dto: VerifyPhoneDto) {
    return this.authService.verifyPhone(dto.phone, dto.code)
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address with OTP' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code)
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken)
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
