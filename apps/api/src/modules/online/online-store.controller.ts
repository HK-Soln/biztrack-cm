import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload } from '@biztrack/types'
import { Resource } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { OnlineStoreService } from './online-store.service'
import {
  CreateOnlineStoreDto,
  ListOnlineProductsDto,
  UpdateOnlineStoreDto,
  UpdateProductOnlineDto,
} from './dto/online-store.dto'

@ApiTags('Online store')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@RequireResource(Resource.ONLINE_STORE)
@Controller('online-store')
export class OnlineStoreController {
  constructor(private readonly onlineStoreService: OnlineStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current business online store config (null if none)' })
  getStore(@CurrentUser() user: JwtPayload) {
    return this.onlineStoreService.getStore(user.businessId as string)
  }

  @Get('slug-check')
  @ApiOperation({
    summary: 'Check whether a subdomain slug is available (format + reserved + uniqueness)',
  })
  checkSlug(@CurrentUser() user: JwtPayload, @Query('slug') slug: string) {
    return this.onlineStoreService.checkSlug(user.businessId as string, slug ?? '')
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

  @Post('publish')
  @ApiOperation({ summary: 'Publish the current draft (snapshot the config; go live)' })
  publish(@CurrentUser() user: JwtPayload) {
    return this.onlineStoreService.publishStore(user.businessId as string, this.actor(user))
  }

  @Get('publications')
  @ApiOperation({ summary: 'Publish history (audit trail), newest first' })
  listPublications(@CurrentUser() user: JwtPayload) {
    return this.onlineStoreService.listPublications(user.businessId as string)
  }

  @Post('publications/:version/restore')
  @ApiOperation({ summary: 'Roll back: restore + republish an earlier published version' })
  restorePublication(
    @CurrentUser() user: JwtPayload,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.onlineStoreService.restorePublication(
      user.businessId as string,
      version,
      this.actor(user),
    )
  }

  private actor(user: JwtPayload): { id: string | null; name: string | null } {
    return { id: user.sub, name: (user as { name?: string }).name ?? null }
  }

  @Get('products')
  @ApiOperation({ summary: 'List products with their online-store publish state (admin)' })
  listProducts(@CurrentUser() user: JwtPayload, @Query() query: ListOnlineProductsDto) {
    return this.onlineStoreService.listProducts(user.businessId as string, query)
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
