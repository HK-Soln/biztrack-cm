import { Controller, Get, Post, Patch, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { BusinessService } from './business.service'
import { CreateBusinessDto } from './dto/create-business.dto'
import { UpdateBusinessDto } from './dto/update-business.dto'
import { Phase2Guard } from '../auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'

@ApiTags('Business')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('business')
export class BusinessController {
  constructor(private businessService: BusinessService) {}

  @Post()
  @ApiOperation({ summary: 'Create a business (called once after registration)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBusinessDto) {
    return this.businessService.create(user.sub, dto)
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my business' })
  getMyBusiness(@CurrentUser() user: JwtPayload) {
    return this.businessService.findById(user.businessId as string)
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my business' })
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBusinessDto) {
    return this.businessService.update(user.businessId as string, user.sub, dto)
  }
}
