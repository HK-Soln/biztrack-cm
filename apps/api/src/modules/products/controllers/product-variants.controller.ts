import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource } from '@biztrack/types'
import type { AuditContext, JwtPayload, ProductVariant } from '@biztrack/types'
import { serializeDto, serializeDtos } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { AddProductVariantDto } from '../dto/add-product-variant.dto'
import { RemoveProductVariantDto } from '../dto/remove-product-variant.dto'
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto'
import { ProductVariantManagementService } from '../services/product-variant-management.service'

@ApiTags('Product Variants')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('products/:productId/variants')
export class ProductVariantsController {
  constructor(private readonly variantManagement: ProductVariantManagementService) {}

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List a product’s variants (with current stock)' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
  ): Promise<ProductVariant[]> {
    return serializeDtos(await this.variantManagement.list(productId, user.businessId as string), (v) => v)
  }

  @Post()
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Add a variant (opening stock → stock-in movement)' })
  async add(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body() dto: AddProductVariantDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<ProductVariant> {
    return serializeDto(await this.variantManagement.addVariant(productId, user.businessId as string, dto, auditContext))
  }

  @Patch(':variantId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Edit a variant’s catalog info (no stock movement)' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<ProductVariant> {
    return serializeDto(
      await this.variantManagement.updateVariant(productId, variantId, user.businessId as string, dto, auditContext),
    )
  }

  @Delete(':variantId')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a variant (writes off its stock → stock-out movement)' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: RemoveProductVariantDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<void> {
    return this.variantManagement.removeVariant(productId, variantId, user.businessId as string, dto, auditContext)
  }
}
