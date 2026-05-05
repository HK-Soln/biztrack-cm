import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { CreateExpenseCategoryRequest, JwtPayload, UpdateExpenseCategoryRequest } from '@biztrack/types'
import { BusinessMemberRole } from '@biztrack/types'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { I18nService } from 'nestjs-i18n'
import { EntityManager, IsNull, Not, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Expense } from '@/entities/expense.entity'
import { ExpenseCategory } from '@/entities/expense-category.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'

type ExpenseCategoryRow = ExpenseCategory & {
  expenseCount?: number
}

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepo: Repository<ExpenseCategory>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ExpenseCategoriesService')
  }

  async findAll(businessId: string) {
    try {
      const { entities, raw } = await this.categoriesRepo
        .createQueryBuilder('category')
        .withDeleted()
        .leftJoin(
          Expense,
          'expense',
          'expense.category_id = category.id AND expense.business_id = :businessId AND expense.deleted_at IS NULL',
          { businessId },
        )
        .addSelect('COUNT(expense.id)', 'expenseCount')
        .where('(category.business_id IS NULL OR category.business_id = :businessId)', { businessId })
        .andWhere('category.deleted_at IS NULL')
        .groupBy('category.id')
        .orderBy('category.sort_order', 'ASC')
        .addOrderBy('category.name', 'ASC')
        .getRawAndEntities()

      const counts = new Map<string, number>()
      raw.forEach((row) => {
        counts.set(row.category_id, Number(row.expenseCount ?? 0))
      })

      return entities.map((entity) =>
        Object.assign(entity, { expenseCount: counts.get(entity.id) ?? 0 }) as ExpenseCategoryRow,
      )
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  async create(businessId: string, user: JwtPayload, dto: CreateExpenseCategoryRequest) {
    try {
      this.assertManageAccess(user)
      const slug = await this.generateUniqueSlug(businessId, dto.name)
      const category = await this.categoriesRepo.save(
        this.categoriesRepo.create({
          businessId,
          name: dto.name.trim(),
          slug,
          color: dto.color.trim().toUpperCase(),
          icon: dto.icon?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
        }),
      )

      return this.findById(category.id, businessId)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, userId: user.sub })
    }
  }

  async update(
    id: string,
    businessId: string,
    user: JwtPayload,
    dto: UpdateExpenseCategoryRequest,
  ) {
    try {
      this.assertManageAccess(user)
      const category = await this.findEditableById(id, businessId)
      const nextName = dto.name?.trim() ?? category.name
      const slug =
        dto.name && dto.name.trim() !== category.name
          ? await this.generateUniqueSlug(businessId, dto.name, id)
          : category.slug

      await this.categoriesRepo.update(id, {
        name: nextName,
        slug,
        color: dto.color === undefined ? category.color : dto.color.trim().toUpperCase(),
        icon: dto.icon === undefined ? category.icon ?? null : (dto.icon?.trim() || null),
        sortOrder: dto.sortOrder ?? category.sortOrder,
        updatedAt: new Date(),
      })

      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId, userId: user.sub })
    }
  }

  async remove(id: string, businessId: string, user: JwtPayload): Promise<void> {
    try {
      this.assertManageAccess(user)
      const category = await this.findEditableById(id, businessId)
      const expenseCount = await this.expensesRepo.count({
        where: {
          businessId,
          categoryId: category.id,
          deletedAt: IsNull(),
        },
      })

      if (expenseCount > 0) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.expense_category_in_use' as never, {
            args: { count: expenseCount },
          }),
          'CATEGORY_IN_USE',
          { expenseCount },
        )
      }

      await this.categoriesRepo.softDelete(category.id)
    } catch (error) {
      return this.handleServiceError('remove', error, { id, businessId, userId: user.sub })
    }
  }

  async findById(id: string, businessId: string) {
    const category = await this.categoriesRepo.findOne({
      where: [
        { id, businessId, deletedAt: IsNull() },
        { id, businessId: IsNull(), deletedAt: IsNull() },
      ],
    })

    if (!category) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.expense_category_not_found' as never),
        'CATEGORY_NOT_FOUND',
      )
    }

    const expenseCount = await this.expensesRepo.count({
      where: {
        businessId,
        categoryId: category.id,
        deletedAt: IsNull(),
      },
    })

    return Object.assign(category, { expenseCount }) as ExpenseCategoryRow
  }

  async resolveAccessibleCategory(
    id: string,
    businessId: string,
    manager?: EntityManager,
  ): Promise<ExpenseCategory> {
    const repo = manager?.getRepository(ExpenseCategory) ?? this.categoriesRepo
    const category = await repo.findOne({
      where: [
        { id, businessId, deletedAt: IsNull() },
        { id, businessId: IsNull(), deletedAt: IsNull() },
      ],
    })

    if (!category) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.expense_category_not_found' as never),
        'CATEGORY_NOT_FOUND',
      )
    }

    return category
  }

  async upsertFromSync(
    id: string,
    businessId: string,
    payload: {
      name: string
      color: string
      icon?: string | null
      sortOrder?: number | null
      createdAt?: string
      updatedAt?: string
      deletedAt?: string | null
      isDeleted?: boolean
    },
    action: 'UPSERT' | 'DELETE',
    recordUpdatedAt: Date,
  ) {
    const existing = await this.categoriesRepo.findOne({
      where: { id, businessId },
      withDeleted: true,
    })

    if (action === 'DELETE' || payload.isDeleted) {
      if (!existing) {
        return
      }

      await this.categoriesRepo.update(id, {
        deletedAt: this.parseOptionalDate(payload.deletedAt) ?? new Date(),
        updatedAt: recordUpdatedAt,
      })
      return
    }

    const createdAt = this.parseOptionalDate(payload.createdAt) ?? existing?.createdAt ?? new Date()

    const entity = this.categoriesRepo.create({
      id,
      businessId,
      name: payload.name.trim(),
      slug: existing?.slug ?? (await this.generateUniqueSlug(businessId, payload.name, existing?.id)),
      color: payload.color.trim().toUpperCase(),
      icon: payload.icon?.trim() ?? null,
      sortOrder: payload.sortOrder ?? 0,
      createdAt,
      updatedAt: recordUpdatedAt,
      deletedAt: null,
    })

    await this.categoriesRepo.save(entity)
  }

  private async findEditableById(id: string, businessId: string) {
    const category = await this.findById(id, businessId)

    if (!category.businessId) {
      throw new AppForbiddenException(
        await this.i18n.translate('errors.expense_category_system_immutable' as never),
        'SYSTEM_CATEGORY_IMMUTABLE',
      )
    }

    return category
  }

  private assertManageAccess(user: JwtPayload) {
    if (![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(user.role as BusinessMemberRole)) {
      throw new AppForbiddenException(
        'Only owners and managers can manage expense categories.',
        'FORBIDDEN',
      )
    }
  }

  private async generateUniqueSlug(businessId: string, name: string, excludeId?: string) {
    const base = this.toSlug(name) || 'expense-category'
    let slug = base
    let suffix = 2

    while (true) {
      const existing = await this.categoriesRepo.findOne({
        where: [
          {
            businessId,
            slug,
            deletedAt: IsNull(),
            ...(excludeId ? { id: Not(excludeId) } : {}),
          },
          {
            businessId: IsNull(),
            slug,
            deletedAt: IsNull(),
          },
        ],
      })

      if (!existing) {
        return slug
      }

      slug = `${base}-${suffix++}`
    }
  }

  private toSlug(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100)
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) {
      return null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ExpenseCategoriesService error', 'ExpenseCategoriesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('ExpenseCategoriesService unexpected error', 'ExpenseCategoriesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'EXPENSE_CATEGORIES_SERVICE_ERROR',
      { action },
    )
  }
}
