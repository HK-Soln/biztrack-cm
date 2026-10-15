import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'
import type { JwtPayload } from '@biztrack/types'
import { Resource } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { OnlineCustomersService } from './online-customers.service'

class AddOnlineCustomerToContactsDto {
  @IsOptional()
  @IsIn(['MERGE', 'CREATE'])
  onDuplicate?: 'MERGE' | 'CREATE'
}

@ApiTags('Online customers')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@RequireResource(Resource.ONLINE_STORE)
@Controller('online-store/customers')
export class OnlineCustomersController {
  constructor(private readonly customers: OnlineCustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List the people who have ordered online (paginated)' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customers.list(user.businessId as string, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Post(':id/contact')
  @ApiOperation({ summary: 'Add an online customer to the contacts' })
  addToContacts(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOnlineCustomerToContactsDto,
  ) {
    return this.customers.addToContacts(user.businessId as string, user, id, dto.onDuplicate)
  }
}
