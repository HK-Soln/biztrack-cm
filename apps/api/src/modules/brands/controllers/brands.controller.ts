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
import type { AuditContext, Brand, JwtPayload, Model, PaginatedResult } from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { BrandResponseDto, ModelResponseDto } from '../dto/brand-response.dto'
import { CreateBrandDto } from '../dto/create-brand.dto'
import { CreateModelDto } from '../dto/create-model.dto'
import { ListBrandsQueryDto } from '../dto/list-brands-query.dto'
import { UpdateBrandDto } from '../dto/update-brand.dto'
import { UpdateModelDto } from '../dto/update-model.dto'
import { BrandsService } from '../services/brands.service'

@ApiTags('Brands')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List brands (with category links + models)' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListBrandsQueryDto,
  ): Promise<PaginatedResult<Brand>> {
    const result = await this.brandsService.list(user.businessId as string, query)
    return serializePaginatedResult(result, (b) => BrandResponseDto.fromEntity(b)!)
  }

  @Get(':id')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Get a brand' })
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<Brand> {
    return serializeDto(BrandResponseDto.fromEntity(await this.brandsService.findById(id, user.businessId as string))!)
  }

  @Post()
  @RequireResource(Resource.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Create a brand' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBrandDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Brand> {
    return serializeDto(BrandResponseDto.fromEntity(await this.brandsService.create(user.businessId as string, dto, auditContext))!)
  }

  @Patch(':id')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update a brand (incl. category links)' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Brand> {
    return serializeDto(BrandResponseDto.fromEntity(await this.brandsService.update(id, user.businessId as string, dto, auditContext))!)
  }

  @Delete(':id')
  @RequireResource(Resource.PRODUCTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a brand (cascades models + category links)' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<void> {
    return this.brandsService.remove(id, user.businessId as string, auditContext)
  }

  @Post(':id/models')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Add a model to a brand' })
  async addModel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateModelDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Model> {
    return serializeDto(ModelResponseDto.fromEntity(await this.brandsService.addModel(id, user.businessId as string, dto, auditContext))!)
  }

  @Patch(':id/models/:modelId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update a model' })
  async updateModel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('modelId') modelId: string,
    @Body() dto: UpdateModelDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<Model> {
    return serializeDto(
      ModelResponseDto.fromEntity(await this.brandsService.updateModel(id, modelId, user.businessId as string, dto, auditContext))!,
    )
  }

  @Delete(':id/models/:modelId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a model' })
  removeModel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('modelId') modelId: string,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<void> {
    return this.brandsService.removeModel(id, modelId, user.businessId as string, auditContext)
  }
}
