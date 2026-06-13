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
import type { AttributeGroup, AttributeOption, JwtPayload } from '@biztrack/types'
import { serializeDto } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { CreateAttributeGroupDto, UpdateAttributeGroupDto } from '../dto/create-attribute-group.dto'
import {
  CreateAttributeOptionDto,
  UpdateAttributeOptionDto,
} from '../dto/create-attribute-option.dto'
import { AttributeGroupDto, AttributeOptionDto } from '../dto/attribute-group-response.dto'
import { AttributeGroupsService } from '../services/attribute-groups.service'

@ApiTags('Attribute Groups')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('attribute-groups')
export class AttributeGroupsController {
  constructor(private readonly attributeGroupsService: AttributeGroupsService) {}

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List attribute groups (with options) for the business' })
  async list(@CurrentUser() user: JwtPayload): Promise<AttributeGroup[]> {
    const groups = await this.attributeGroupsService.listGroups(user.businessId as string)
    return groups.map((group) => serializeDto(AttributeGroupDto.fromEntity(group)!))
  }

  @Post()
  @RequireResource(Resource.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Create an attribute group' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAttributeGroupDto,
  ): Promise<AttributeGroup> {
    return serializeDto(
      AttributeGroupDto.fromEntity(
        await this.attributeGroupsService.createGroup(user.businessId as string, dto),
      )!,
    )
  }

  @Patch(':id')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update an attribute group' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAttributeGroupDto,
  ): Promise<AttributeGroup> {
    return serializeDto(
      AttributeGroupDto.fromEntity(
        await this.attributeGroupsService.updateGroup(id, user.businessId as string, dto),
      )!,
    )
  }

  @Delete(':id')
  @RequireResource(Resource.PRODUCTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attribute group (fails if linked to a category)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.attributeGroupsService.removeGroup(id, user.businessId as string)
  }

  @Get(':id/options')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List options in an attribute group' })
  async listOptions(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<AttributeOption[]> {
    const options = await this.attributeGroupsService.listOptions(id, user.businessId as string)
    return options.map((option) => serializeDto(AttributeOptionDto.fromEntity(option)!))
  }

  @Post(':id/options')
  @RequireResource(Resource.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Add an option to a group (also the on-the-fly creation path)' })
  async addOption(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateAttributeOptionDto,
  ): Promise<AttributeOption> {
    return serializeDto(
      AttributeOptionDto.fromEntity(
        await this.attributeGroupsService.addOption(id, user.businessId as string, dto),
      )!,
    )
  }

  @Patch(':id/options/:optionId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update an attribute option' })
  async updateOption(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateAttributeOptionDto,
  ): Promise<AttributeOption> {
    return serializeDto(
      AttributeOptionDto.fromEntity(
        await this.attributeGroupsService.updateOption(id, optionId, user.businessId as string, dto),
      )!,
    )
  }

  @Delete(':id/options/:optionId')
  @RequireResource(Resource.PRODUCTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate an attribute option' })
  removeOption(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('optionId') optionId: string,
  ): Promise<void> {
    return this.attributeGroupsService.removeOption(id, optionId, user.businessId as string)
  }
}
