import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource } from '@biztrack/types'
import type { JwtPayload, PaginatedResult, UnitOfMeasure } from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { ListUnitOfMeasuresQueryDto } from '../dto/list-unit-of-measures-query.dto'
import { CreateUnitOfMeasureDto } from '../dto/create-unit-of-measure.dto'
import { UnitOfMeasureDto } from '../dto/unit-of-measure-response.dto'
import { UnitOfMeasuresService } from '../services/unit-of-measures.service'

@ApiTags('Unit Of Measures')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('unit-of-measures')
export class UnitOfMeasuresController {
  constructor(private readonly unitOfMeasuresService: UnitOfMeasuresService) {}

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List default and business-specific units' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListUnitOfMeasuresQueryDto,
  ): Promise<PaginatedResult<UnitOfMeasure>> {
    const result = await this.unitOfMeasuresService.findForBusiness(
      user.businessId as string,
      query,
    )
    return serializePaginatedResult(result, (unit) => UnitOfMeasureDto.fromEntity(unit)!)
  }

  @Post()
  @RequireResource(Resource.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Create a custom unit of measure' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateUnitOfMeasureDto,
  ): Promise<UnitOfMeasure> {
    return serializeDto(
      UnitOfMeasureDto.fromEntity(
        await this.unitOfMeasuresService.create(user.businessId as string, dto),
      )!,
    )
  }
}
