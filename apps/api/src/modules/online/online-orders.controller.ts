import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload, OnlineOrderStatus } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { OnlineOrdersService } from './online-orders.service'
import { UpdateOrderStatusDto } from './dto/online-orders.dto'

@ApiTags('Online orders')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('online-store/orders')
export class OnlineOrdersController {
  constructor(private readonly orders: OnlineOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List online orders (paginated)' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: OnlineOrderStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orders.listOrders(user.businessId as string, {
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Online order detail with event timeline' })
  detail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.orders.getOrder(user.businessId as string, id)
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update an online order status' })
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(user.businessId as string, id, dto, {
      id: user.sub,
      name: (user as { name?: string }).name ?? null,
    })
  }
}
