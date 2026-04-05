import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '@/common/decorators/public.decorator'
import { AuthService } from './auth.service'
import { Phase2Guard } from './guards/phase2.guard'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'
import { SendInviteDto } from './dto/send-invite.dto'

@ApiTags('Invites')
@Controller('invites')
export class InvitesController {
  constructor(private authService: AuthService) {}

  @Post()
  @UseGuards(Phase2Guard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a staff invite' })
  send(@CurrentUser() user: JwtPayload, @Body() dto: SendInviteDto) {
    return this.authService.sendInvite(user.sub, user.businessId as string, dto)
  }

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Preview an invite before registration' })
  preview(@Param('token') token: string) {
    return this.authService.getInvitePreview(token)
  }

  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an invite (existing user)' })
  accept(@CurrentUser() user: JwtPayload, @Param('token') token: string) {
    return this.authService.acceptInvite(user.sub, token)
  }

  @Post(':token/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject an invite (existing user)' })
  reject(@CurrentUser() user: JwtPayload, @Param('token') token: string) {
    return this.authService.rejectInvite(user.sub, token)
  }
}
