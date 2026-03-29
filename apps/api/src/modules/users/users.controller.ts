import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { UpdateUserDto } from './dto/update-user.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.findById(user.sub)
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.sub, dto)
  }
}
