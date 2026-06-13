import { Inject, Injectable } from '@nestjs/common'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type {
  CategoriesQuery,
  CategoryTreeNode,
  CategoryTreeResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { IsNull } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppConflictException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import type { ProductCategory } from '@/entities'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { QuotaService } from '@/modules/permissions/quota.service'
import { ProductCategoriesRepository } from '../repositories/product-categories.repository'
import { ProductsRepository } from '../repositories/products.repository'
import { SlugService } from './slug.service'

const MAX_CATEGORY_DEPTH = 3

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepo: ProductCategoriesRepository,
    private readonly productsRepo: ProductsRepository,
    private readonly slugService: SlugService,
    private readonly quotaService: QuotaService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('CategoriesService')
  }

  async create(businessId: string, dto: CreateCategoryRequest) {
    try {
      await this.quotaService.assertWithinQuota(businessId, 'categories')

      let parentId: string | null = null
      let depth = 1

      if (dto.parentId) {
        const parent = await this.requireParent(dto.parentId, businessId)
        if (parent.depth >= MAX_CATEGORY_DEPTH) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.category_max_depth_exceeded'),
            'MAX_DEPTH_EXCEEDED',
          )
        }
        await this.assertParentHasNoProducts(parent.id, businessId)
        parentId = parent.id
        depth = parent.depth + 1
      }

      const slug = await this.slugService.generateCategorySlug(dto.name, businessId)
      const category = this.categoriesRepo.create({
        businessId,
        name: dto.name.trim(),
        slug,
        isActive: true,
        color: dto.color?.trim() ?? null,
        icon: dto.icon?.trim() ?? null,
        imageUrl: dto.imageUrl?.trim() ?? null,
        sortOrder: dto.sortOrder ?? 0,
        parentId,
        depth,
      })
      const saved = await this.categoriesRepo.save(category)
      // A newly created category never has children yet.
      saved.isLeaf = true
      return saved
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, name: dto.name })
    }
  }

  async findAll(businessId: string, query: CategoriesQuery) {
    try {
      const sortField = this.validateSortField(query.sortBy)

      const result = await this.categoriesRepo.paginate(
        { businessId, deletedAt: IsNull() },
        {
          page: query.page,
          limit: query.limit,
          order: { [sortField]: query.sortOrder || 'ASC' },
        },
      )

      const leafMap = await this.computeLeafMap(
        result.data.map((category) => category.id),
        businessId,
      )
      for (const category of result.data) {
        category.isLeaf = leafMap.get(category.id) ?? true
      }

      return result
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  /** Full nested tree for the admin category picker. */
  async getTree(businessId: string): Promise<CategoryTreeResponse> {
    try {
      const categories = await this.categoriesRepo.find({
        where: { businessId, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', name: 'ASC' },
      })

      const productCounts = await this.countProductsByCategory(businessId)

      const nodeMap = new Map<string, CategoryTreeNode>()
      for (const category of categories) {
        nodeMap.set(category.id, {
          id: category.id,
          name: category.name,
          slug: category.slug,
          depth: category.depth,
          parentId: category.parentId ?? null,
          sortOrder: category.sortOrder,
          isLeaf: true,
          isActive: category.isActive,
          productCount: productCounts.get(category.id) ?? 0,
          imageUrl: category.imageUrl ?? null,
          children: [],
        })
      }

      const roots: CategoryTreeNode[] = []
      for (const category of categories) {
        const node = nodeMap.get(category.id)!
        const parentNode = category.parentId ? nodeMap.get(category.parentId) : undefined
        if (parentNode) {
          parentNode.children.push(node)
        } else {
          roots.push(node)
        }
      }

      // A category is a leaf iff it has zero active child categories.
      for (const node of nodeMap.values()) {
        node.isLeaf = node.children.every((child) => !child.isActive)
      }

      return { tree: roots }
    } catch (error) {
      return this.handleServiceError('getTree', error, { businessId })
    }
  }

  private validateSortField(field?: string): string {
    const allowedFields = ['name', 'createdAt', 'updatedAt', 'sortOrder', 'depth']
    return allowedFields.includes(field ?? '') ? field! : 'sortOrder'
  }

  async update(id: string, businessId: string, dto: UpdateCategoryRequest) {
    try {
      const category = await this.findById(id, businessId)

      let parentId = category.parentId ?? null
      let depth = category.depth

      // Reparenting. Only leaf nodes can be reparented so we never have to
      // cascade depth changes through a subtree (and a leaf has no descendants,
      // so the only possible cycle is the node itself).
      if (dto.parentId !== undefined) {
        const nextParentId = dto.parentId || null
        if (nextParentId !== (category.parentId ?? null)) {
          if (await this.hasChildren(id, businessId)) {
            throw new AppBadRequestException(
              await this.i18n.translate('errors.category_reparent_has_children'),
              'CATEGORY_REPARENT_HAS_CHILDREN',
            )
          }
          if (nextParentId === null) {
            parentId = null
            depth = 1
          } else {
            if (nextParentId === id) {
              throw new AppBadRequestException(
                await this.i18n.translate('errors.category_parent_cycle'),
                'CATEGORY_PARENT_CYCLE',
              )
            }
            const parent = await this.requireParent(nextParentId, businessId)
            if (parent.depth >= MAX_CATEGORY_DEPTH) {
              throw new AppBadRequestException(
                await this.i18n.translate('errors.category_max_depth_exceeded'),
                'MAX_DEPTH_EXCEEDED',
              )
            }
            await this.assertParentHasNoProducts(parent.id, businessId)
            parentId = parent.id
            depth = parent.depth + 1
          }
        }
      }

      const slug = dto.name
        ? await this.slugService.generateCategorySlug(dto.name, businessId, id)
        : category.slug

      await this.categoriesRepo.update(id, {
        name: dto.name?.trim() ?? category.name,
        slug,
        isActive: dto.isActive ?? category.isActive,
        color: dto.color === undefined ? category.color : (dto.color?.trim() ?? null),
        icon: dto.icon === undefined ? category.icon : (dto.icon?.trim() ?? null),
        imageUrl: dto.imageUrl === undefined ? category.imageUrl : (dto.imageUrl?.trim() ?? null),
        sortOrder: dto.sortOrder ?? category.sortOrder,
        parentId,
        depth,
        updatedAt: new Date(),
      })

      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId })
    }
  }

  async remove(id: string, businessId: string): Promise<void> {
    try {
      await this.findById(id, businessId)

      if (await this.hasChildren(id, businessId)) {
        throw new AppConflictException(
          await this.i18n.translate('errors.category_reparent_has_children'),
          'CATEGORY_HAS_CHILDREN',
        )
      }

      const productCount = await this.productsRepo
        .createQueryBuilder('product')
        .where('product.business_id = :businessId', { businessId })
        .andWhere('product.category_id = :id', { id })
        .andWhere('product.deleted_at IS NULL')
        .getCount()

      if (productCount > 0) {
        throw new AppConflictException(
          await this.i18n.translate('errors.category_has_products'),
          'CATEGORY_HAS_PRODUCTS',
          { productCount },
        )
      }

      await this.categoriesRepo.update(id, {
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
    } catch (error) {
      return this.handleServiceError('remove', error, { id, businessId })
    }
  }

  async findById(id: string, businessId: string) {
    const category = await this.categoriesRepo.findOne({
      where: { id, businessId, deletedAt: IsNull() },
    })

    if (!category) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.category_not_found'),
        'CATEGORY_NOT_FOUND',
      )
    }

    category.isLeaf = !(await this.hasActiveChildren(id, businessId))
    return category
  }

  private async requireParent(parentId: string, businessId: string): Promise<ProductCategory> {
    const parent = await this.categoriesRepo.findOne({
      where: { id: parentId, businessId, deletedAt: IsNull() },
    })
    if (!parent) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.category_parent_not_found'),
        'CATEGORY_PARENT_NOT_FOUND',
      )
    }
    return parent
  }

  private async assertParentHasNoProducts(parentId: string, businessId: string): Promise<void> {
    const parentProductCount = await this.productsRepo
      .createQueryBuilder('product')
      .where('product.business_id = :businessId', { businessId })
      .andWhere('product.category_id = :parentId', { parentId })
      .andWhere('product.deleted_at IS NULL')
      .getCount()

    if (parentProductCount > 0) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.category_parent_has_products'),
        'PARENT_HAS_PRODUCTS',
      )
    }
  }

  /** Any non-deleted child (active or not) — used to block reparent/delete. */
  private async hasChildren(parentId: string, businessId: string): Promise<boolean> {
    const count = await this.categoriesRepo
      .createQueryBuilder('category')
      .where('category.business_id = :businessId', { businessId })
      .andWhere('category.parent_id = :parentId', { parentId })
      .andWhere('category.deleted_at IS NULL')
      .getCount()
    return count > 0
  }

  /** Active (isActive=true, non-deleted) children — determines leaf status. */
  private async hasActiveChildren(parentId: string, businessId: string): Promise<boolean> {
    const count = await this.categoriesRepo
      .createQueryBuilder('category')
      .where('category.business_id = :businessId', { businessId })
      .andWhere('category.parent_id = :parentId', { parentId })
      .andWhere('category.deleted_at IS NULL')
      .andWhere('category.is_active = true')
      .getCount()
    return count > 0
  }

  private async computeLeafMap(
    categoryIds: string[],
    businessId: string,
  ): Promise<Map<string, boolean>> {
    const leafMap = new Map<string, boolean>()
    if (categoryIds.length === 0) {
      return leafMap
    }

    const parentsWithActiveChildren = await this.categoriesRepo
      .createQueryBuilder('category')
      .select('category.parent_id', 'parentId')
      .where('category.business_id = :businessId', { businessId })
      .andWhere('category.parent_id IN (:...categoryIds)', { categoryIds })
      .andWhere('category.deleted_at IS NULL')
      .andWhere('category.is_active = true')
      .groupBy('category.parent_id')
      .getRawMany<{ parentId: string }>()

    const nonLeaf = new Set(parentsWithActiveChildren.map((row) => row.parentId))
    for (const id of categoryIds) {
      leafMap.set(id, !nonLeaf.has(id))
    }
    return leafMap
  }

  private async countProductsByCategory(businessId: string): Promise<Map<string, number>> {
    const rows = await this.productsRepo
      .createQueryBuilder('product')
      .select('product.category_id', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('product.business_id = :businessId', { businessId })
      .andWhere('product.deleted_at IS NULL')
      .andWhere('product.category_id IS NOT NULL')
      .groupBy('product.category_id')
      .getRawMany<{ categoryId: string; count: string }>()

    return new Map(rows.map((row) => [row.categoryId, Number(row.count)]))
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('CategoriesService error', 'CategoriesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('CategoriesService unexpected error', 'CategoriesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'CATEGORIES_SERVICE_ERROR',
      { action },
    )
  }
}
