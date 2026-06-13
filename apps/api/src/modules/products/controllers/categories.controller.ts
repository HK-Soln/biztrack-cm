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
import type {
  CategoryAttributeGroupNode,
  CategoryTreeNode,
  CategoryTreeResponse,
  JwtPayload,
  PaginatedResult,
  ProductCategory,
} from '@biztrack/types'
import { serializeDto, serializePaginatedResult } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto'
import { CreateCategoryDto } from '../dto/create-category.dto'
import { UpdateCategoryDto } from '../dto/update-category.dto'
import {
  LinkCategoryAttributeGroupDto,
  UpdateCategoryAttributeGroupDto,
} from '../dto/link-category-attribute-group.dto'
import { CategoryDto } from '../dto/category-response.dto'
import { CategoriesService } from '../services/categories.service'
import { AttributeGroupsService } from '../services/attribute-groups.service'

@ApiTags('Product Categories')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('products/categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly attributeGroupsService: AttributeGroupsService,
  ) {}

  @Post()
  @RequireResource(Resource.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Create a product category' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCategoryDto,
  ): Promise<ProductCategory> {
    return serializeDto(
      CategoryDto.fromEntity(await this.categoriesService.create(user.businessId as string, dto))!,
    )
  }

  @Get()
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List product categories' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<PaginatedResult<ProductCategory>> {
    const result = await this.categoriesService.findAll(user.businessId as string, query)
    return serializePaginatedResult(result, (category) => CategoryDto.fromEntity(category)!)
  }

  @Get('tree')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Get the nested category tree with attribute groups on leaf nodes' })
  async tree(@CurrentUser() user: JwtPayload): Promise<CategoryTreeResponse> {
    const businessId = user.businessId as string
    const { tree } = await this.categoriesService.getTree(businessId)

    // Enrich leaf nodes with their linked attribute groups (orchestrated here so
    // CategoriesService and AttributeGroupsService stay decoupled — no cycle).
    const leafIds: string[] = []
    const collectLeaves = (nodes: CategoryTreeNode[]) => {
      for (const node of nodes) {
        if (node.isLeaf) leafIds.push(node.id)
        collectLeaves(node.children)
      }
    }
    collectLeaves(tree)

    if (leafIds.length > 0) {
      const groupsByCategory = await this.attributeGroupsService.getAttributeGroupsByCategory(
        businessId,
        leafIds,
      )
      const attach = (nodes: CategoryTreeNode[]) => {
        for (const node of nodes) {
          if (node.isLeaf) {
            node.attributeGroups = groupsByCategory.get(node.id) ?? []
          }
          attach(node.children)
        }
      }
      attach(tree)
    }

    return { tree }
  }

  @Patch(':id')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update a product category' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<ProductCategory> {
    return serializeDto(
      CategoryDto.fromEntity(
        await this.categoriesService.update(id, user.businessId as string, dto),
      )!,
    )
  }

  @Delete(':id')
  @RequireResource(Resource.PRODUCTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product category' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.categoriesService.remove(id, user.businessId as string)
  }

  // ---- Attribute group links (spec §6.1) ----------------------------------

  @Get(':id/attribute-groups')
  @RequireResource(Resource.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'List attribute groups linked to a category' })
  listAttributeGroups(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<CategoryAttributeGroupNode[]> {
    return this.attributeGroupsService.listCategoryLinks(id, user.businessId as string)
  }

  @Post(':id/attribute-groups')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Link an attribute group to a (leaf) category' })
  async linkAttributeGroup(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: LinkCategoryAttributeGroupDto,
  ): Promise<CategoryAttributeGroupNode[]> {
    await this.attributeGroupsService.linkToCategory(id, user.businessId as string, dto)
    return this.attributeGroupsService.listCategoryLinks(id, user.businessId as string)
  }

  @Patch(':id/attribute-groups/:groupId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update a category↔attribute-group link (sortOrder, isRequired)' })
  async updateAttributeGroupLink(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateCategoryAttributeGroupDto,
  ): Promise<CategoryAttributeGroupNode[]> {
    await this.attributeGroupsService.updateCategoryLink(id, groupId, user.businessId as string, dto)
    return this.attributeGroupsService.listCategoryLinks(id, user.businessId as string)
  }

  @Delete(':id/attribute-groups/:groupId')
  @RequireResource(Resource.PRODUCTS_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink an attribute group from a category' })
  unlinkAttributeGroup(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('groupId') groupId: string,
  ): Promise<void> {
    return this.attributeGroupsService.unlinkFromCategory(id, groupId, user.businessId as string)
  }
}
