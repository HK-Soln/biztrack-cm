import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'
import { BusinessMembersRepository } from './repositories/business-members.repository'
import { BusinessService } from './business.service'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { UpdateBusinessDto } from './dto/update-business.dto'

@ApiTags('Businesses')
@ApiBearerAuth()
@Controller('businesses')
export class BusinessesController {
  constructor(
    private membersRepo: BusinessMembersRepository,
    private businessService: BusinessService,
  ) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List businesses for current user' })
  async mine(@CurrentUser() user: JwtPayload) {
    const memberships = await this.membersRepo.find({
      where: { userId: user.sub },
      relations: ['business'],
      order: { createdAt: 'ASC' },
    })

    return memberships.map((m) => ({
      businessId: m.businessId,
      role: m.role,
      status: m.status,
      business: m.business
        ? {
            id: m.business.id,
            name: m.business.name,
            slug: m.business.slug,
            city: m.business.city ?? null,
            type: m.business.type,
            plan: m.business.plan,
            businessStatus: m.business.businessStatus,
          }
        : null,
      }))
  }

  @Post('setup')
  @UseGuards(Phase2Guard)
  @ApiOperation({ summary: 'Setup business details during onboarding' })
  setup(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBusinessDto) {
    return this.businessService.update(user.businessId as string, user.sub, dto)
  }
}
