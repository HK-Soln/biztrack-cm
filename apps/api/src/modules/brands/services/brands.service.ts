import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type {
  AuditContext,
  BrandsQuery,
  CreateBrandRequest,
  CreateModelRequest,
  UpdateBrandRequest,
  UpdateModelRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { AppException } from '@/common/exceptions/app.exception'
import { AppInternalServerException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { Brand } from '@/entities/brand.entity'
import { BrandCategory } from '@/entities/brand-category.entity'
import { Model } from '@/entities/model.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { AuditService } from '@/modules/audit/audit.service'

/**
 * Brands + their Models (and brand↔category M2M links). REST counterpart of the
 * desktop offline brands service, so the cloud app manages brands the same way.
 * Every mutation is audited with the full actor context.
 */
@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepo: Repository<Brand>,
    @InjectRepository(Model)
    private readonly modelsRepo: Repository<Model>,
    @InjectRepository(BrandCategory)
    private readonly linksRepo: Repository<BrandCategory>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('BrandsService')
  }

  async list(businessId: string, query: BrandsQuery) {
    try {
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const sortColumn = query.sortBy === 'name' ? 'b.name' : query.sortBy === 'createdAt' ? 'b.created_at' : 'b.sort_order'
      const order = query.sortOrder === 'DESC' ? 'DESC' : 'ASC'

      // Single query: join the relations (models + category links) and filter by
      // category via EXISTS (avoids row duplication). TypeORM paginates on distinct
      // brand ids, so take/skip stays correct with the joined collections.
      const qb = this.brandsRepo
        .createQueryBuilder('b')
        .leftJoinAndSelect('b.models', 'm', 'm.deleted_at IS NULL')
        .leftJoinAndSelect('b.categoryLinks', 'cl', 'cl.deleted_at IS NULL')
        .where('b.business_id = :businessId AND b.deleted_at IS NULL', { businessId })
      if (query.search) qb.andWhere('b.name ILIKE :s', { s: `%${query.search}%` })
      if (query.categoryId) {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM brand_categories bc WHERE bc.brand_id = b.id AND bc.deleted_at IS NULL AND bc.category_id = :categoryId)',
          { categoryId: query.categoryId },
        )
      }
      const [data, total] = await qb
        .orderBy(sortColumn, order)
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount()

      return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
    } catch (error) {
      return this.handleServiceError('list', error, { businessId })
    }
  }

  async findById(id: string, businessId: string): Promise<Brand> {
    const brand = await this.brandsRepo.findOne({
      where: { id, businessId, deletedAt: IsNull() },
      relations: { models: true, categoryLinks: true },
    })
    if (!brand) {
      throw new AppNotFoundException(await this.i18n.translate('errors.brand_not_found'), 'BRAND_NOT_FOUND')
    }
    return brand
  }

  async create(businessId: string, dto: CreateBrandRequest, context: AuditContext): Promise<Brand> {
    try {
      const slug = await this.uniqueSlug(this.slugify(dto.name), businessId)
      const id = await this.dataSource.transaction(async (manager) => {
        const brand = await manager.getRepository(Brand).save(
          manager.getRepository(Brand).create({
            businessId,
            name: dto.name.trim(),
            slug,
            logoUrl: dto.logoUrl?.trim() ?? null,
            description: dto.description?.trim() ?? null,
            sortOrder: dto.sortOrder ?? 0,
            isActive: true,
          }),
        )
        await this.syncLinks(manager, businessId, brand.id, dto.categoryIds ?? [])
        return brand.id
      })

      this.auditService.log(context, {
        action: 'CREATE',
        entityType: 'brand',
        entityId: id,
        entityLabel: dto.name.trim(),
        changes: { before: null, after: { name: dto.name.trim(), categoryIds: dto.categoryIds ?? [] } },
      })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId })
    }
  }

  async update(id: string, businessId: string, dto: UpdateBrandRequest, context: AuditContext): Promise<Brand> {
    try {
      const brand = await this.findById(id, businessId)
      const before = { name: brand.name, isActive: brand.isActive, categoryIds: (brand.categoryLinks ?? []).map((l) => l.categoryId) }

      await this.dataSource.transaction(async (manager) => {
        const patch: Partial<Brand> = {
          name: dto.name?.trim() ?? brand.name,
          logoUrl: dto.logoUrl === undefined ? brand.logoUrl : (dto.logoUrl?.trim() ?? null),
          description: dto.description === undefined ? brand.description : (dto.description?.trim() ?? null),
          sortOrder: dto.sortOrder ?? brand.sortOrder,
          isActive: dto.isActive ?? brand.isActive,
        }
        if (dto.name && dto.name.trim() !== brand.name) {
          patch.slug = await this.uniqueSlug(this.slugify(dto.name), businessId, id)
        }
        await manager.getRepository(Brand).update({ id, businessId }, patch)
        if (dto.categoryIds) await this.syncLinks(manager, businessId, id, dto.categoryIds)
      })

      const after = await this.findById(id, businessId)
      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'brand',
        entityId: id,
        entityLabel: after.name,
        changes: { before, after: { name: after.name, isActive: after.isActive, categoryIds: (after.categoryLinks ?? []).map((l) => l.categoryId) } },
      })
      return after
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId })
    }
  }

  async remove(id: string, businessId: string, context: AuditContext): Promise<void> {
    try {
      const brand = await this.findById(id, businessId)
      const now = new Date()
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Model).update({ brandId: id, businessId, deletedAt: IsNull() }, { isActive: false, deletedAt: now })
        await manager.getRepository(BrandCategory).softDelete({ brandId: id, businessId })
        await manager.getRepository(Brand).update({ id, businessId }, { isActive: false, deletedAt: now })
      })
      this.auditService.log(context, {
        action: 'DELETE',
        entityType: 'brand',
        entityId: id,
        entityLabel: brand.name,
        changes: { before: { name: brand.name }, after: null },
      })
    } catch (error) {
      return this.handleServiceError('remove', error, { id, businessId })
    }
  }

  async addModel(brandId: string, businessId: string, dto: CreateModelRequest, context: AuditContext): Promise<Model> {
    try {
      await this.findById(brandId, businessId)
      const model = await this.modelsRepo.save(
        this.modelsRepo.create({
          businessId,
          brandId,
          name: dto.name.trim(),
          slug: this.slugify(dto.name) || null,
          sortOrder: dto.sortOrder ?? 0,
          isActive: true,
        }),
      )
      this.auditService.log(context, {
        action: 'CREATE',
        entityType: 'model',
        entityId: model.id,
        entityLabel: model.name,
        changes: { before: null, after: { brandId, name: model.name } },
      })
      return model
    } catch (error) {
      return this.handleServiceError('addModel', error, { brandId, businessId })
    }
  }

  async updateModel(
    brandId: string,
    modelId: string,
    businessId: string,
    dto: UpdateModelRequest,
    context: AuditContext,
  ): Promise<Model> {
    try {
      const model = await this.requireModel(brandId, modelId, businessId)
      const before = { name: model.name, isActive: model.isActive }
      await this.modelsRepo.update(
        { id: modelId },
        {
          name: dto.name?.trim() ?? model.name,
          slug: dto.name ? (this.slugify(dto.name) || null) : model.slug,
          sortOrder: dto.sortOrder ?? model.sortOrder,
          isActive: dto.isActive ?? model.isActive,
        },
      )
      const after = await this.requireModel(brandId, modelId, businessId)
      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'model',
        entityId: modelId,
        entityLabel: after.name,
        changes: { before, after: { name: after.name, isActive: after.isActive } },
      })
      return after
    } catch (error) {
      return this.handleServiceError('updateModel', error, { brandId, modelId, businessId })
    }
  }

  async removeModel(brandId: string, modelId: string, businessId: string, context: AuditContext): Promise<void> {
    try {
      const model = await this.requireModel(brandId, modelId, businessId)
      await this.modelsRepo.update({ id: modelId }, { isActive: false, deletedAt: new Date() })
      this.auditService.log(context, {
        action: 'DELETE',
        entityType: 'model',
        entityId: modelId,
        entityLabel: model.name,
        changes: { before: { name: model.name }, after: null },
      })
    } catch (error) {
      return this.handleServiceError('removeModel', error, { brandId, modelId, businessId })
    }
  }

  // ---- internals -----------------------------------------------------------

  /** Reconcile a brand's category links to exactly `categoryIds` (soft-delete removed, add new). */
  private async syncLinks(manager: EntityManager, businessId: string, brandId: string, categoryIds: string[]): Promise<void> {
    const repo = manager.getRepository(BrandCategory)
    const existing = await repo.find({ where: { brandId, businessId, deletedAt: IsNull() } })
    const want = new Set(categoryIds)
    const have = new Set(existing.map((l) => l.categoryId))

    const toRemove = existing.filter((l) => !want.has(l.categoryId))
    if (toRemove.length) await repo.softDelete({ id: In(toRemove.map((l) => l.id)) })

    const toAdd = categoryIds.filter((c) => !have.has(c))
    if (toAdd.length) {
      await repo.save(toAdd.map((categoryId) => repo.create({ businessId, brandId, categoryId })))
    }
  }

  private async requireModel(brandId: string, modelId: string, businessId: string): Promise<Model> {
    const model = await this.modelsRepo.findOne({ where: { id: modelId, brandId, businessId, deletedAt: IsNull() } })
    if (!model) {
      throw new AppNotFoundException(await this.i18n.translate('errors.model_not_found'), 'MODEL_NOT_FOUND')
    }
    return model
  }

  private async uniqueSlug(base: string, businessId: string, excludeId?: string): Promise<string> {
    const root = base || 'brand'
    let slug = root
    let n = 2
    while (true) {
      const clash = await this.brandsRepo.findOne({
        where: { businessId, slug, ...(excludeId ? { id: Not(excludeId) } : {}) },
        withDeleted: true,
      })
      if (!clash) return slug
      slug = `${root}-${n++}`
    }
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 120)
  }

  private async handleServiceError(action: string, error: unknown, metadata?: LogMetadata): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('BrandsService error', 'BrandsService', { action, code: error.code, status: error.getStatus(), ...(metadata ?? {}) })
      throw error
    }
    this.logger.error('BrandsService unexpected error', 'BrandsService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })
    throw new AppInternalServerException(await this.i18n.translate('errors.server_error'), 'BRANDS_SERVICE_ERROR', { action })
  }
}
