import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { OnlineStoreService } from './online-store.service'
import {
  CreateOnlineStoreDto,
  UpdateOnlineStoreDto,
  UpdateProductOnlineDto,
} from './dto/online-store.dto'

@ApiTags('Online store')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('online-store')
export class OnlineStoreController {
  constructor(private readonly onlineStoreService: OnlineStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current business online store config (null if none)' })
  getStore(@CurrentUser() user: JwtPayload) {
    return this.onlineStoreService.getStore(user.businessId as string)
  }

  @Post()
  @ApiOperation({ summary: 'Create the online store' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOnlineStoreDto) {
    return this.onlineStoreService.createStore(user.businessId as string, dto)
  }

  @Patch()
  @ApiOperation({ summary: 'Update the online store config' })
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateOnlineStoreDto) {
    return this.onlineStoreService.updateStore(user.businessId as string, dto)
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update a product online-publishing settings' })
  updateProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductOnlineDto,
  ) {
    return this.onlineStoreService.updateProductOnline(user.businessId as string, id, dto)
  }
}
