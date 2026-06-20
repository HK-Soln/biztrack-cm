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
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource } from '@biztrack/types'
import type { AuditContext, JwtPayload, PaginatedResult, ProductSerialUnit } from '@biztrack/types'
import { serializeDto, serializeDtos, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { AddSerialUnitsDto } from '../dto/add-serial-units.dto'
import { ListSerialUnitsQueryDto } from '../dto/list-serial-units-query.dto'
import { RetireSerialUnitDto } from '../dto/retire-serial-unit.dto'
import { SerialUnitDto } from '../dto/serial-unit-response.dto'
import { UpdateSerialUnitDto } from '../dto/update-serial-unit.dto'
import { ProductSerialUnitsService } from '../services/product-serial-units.service'

@ApiTags('Product Serial Units')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('products/:productId/serial-units')
export class ProductSerialUnitsController {
  constructor(private readonly serialUnitsService: ProductSerialUnitsService) {}

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List a product’s serial units' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Query() query: ListSerialUnitsQueryDto,
  ): Promise<PaginatedResult<ProductSerialUnit>> {
    const result = await this.serialUnitsService.list(productId, user.businessId as string, query)
    return serializePaginatedResult(result, (unit) => SerialUnitDto.fromEntity(unit)!)
  }

  @Post()
  @RequireResource(Resource.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Add serial units to stock (writes a stock-in movement)' })
  async add(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body() dto: AddSerialUnitsDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<ProductSerialUnit[]> {
    const created = await this.serialUnitsService.add(productId, user.businessId as string, dto, auditContext)
    return serializeDtos(created, (unit) => SerialUnitDto.fromEntity(unit)!)
  }

  @Patch(':unitId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Correct a serial number (no stock movement)' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpdateSerialUnitDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<ProductSerialUnit> {
    return serializeDto(
      SerialUnitDto.fromEntity(
        await this.serialUnitsService.updateSerialNumber(
          productId,
          unitId,
          user.businessId as string,
          dto,
          auditContext,
        ),
      )!,
    )
  }

  @Delete(':unitId')
  @RequireResource(Resource.INVENTORY_ADJUST)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retire a serial unit from stock (writes a stock-out movement)' })
  retire(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('unitId') unitId: string,
    @Body() dto: RetireSerialUnitDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<void> {
    return this.serialUnitsService.retire(productId, unitId, user.businessId as string, dto, auditContext)
  }
}
