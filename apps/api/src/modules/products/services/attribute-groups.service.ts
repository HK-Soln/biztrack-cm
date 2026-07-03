import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Not, Repository } from 'typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  AttributeDisplayType,
  type CategoryAttributeGroupNode,
  type CreateAttributeGroupRequest,
  type CreateAttributeOptionRequest,
  type LinkCategoryAttributeGroupRequest,
  type UpdateAttributeGroupRequest,
  type UpdateAttributeOptionRequest,
  type UpdateCategoryAttributeGroupRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppConflictException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { AttributeGroup } from '@/entities/attribute-group.entity'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { CategoryAttributeGroup } from '@/entities/category-attribute-group.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { CategoriesService } from './categories.service'

type DefaultGroup = {
  name: string
  displayType: AttributeDisplayType
  options: Array<{ value: string; colorHex?: string }>
}

// Seeded for every new business (spec 3.4). Editable/deletable by the owner.
const DEFAULT_ATTRIBUTE_GROUPS: DefaultGroup[] = [
  {
    name: 'Color',
    displayType: AttributeDisplayType.SWATCHES,
    options: [
      { value: 'Black', colorHex: '#1A1A1A' },
      { value: 'White', colorHex: '#F5F5F5' },
      { value: 'Blue', colorHex: '#1565C0' },
      { value: 'Red', colorHex: '#C62828' },
      { value: 'Gold', colorHex: '#B7950B' },
      { value: 'Silver', colorHex: '#9E9E9E' },
      { value: 'Green', colorHex: '#2E7D32' },
      { value: 'Pink', colorHex: '#E91E8C' },
    ],
  },
  {
    name: 'Storage',
    displayType: AttributeDisplayType.CHIPS,
    options: ['64GB', '128GB', '256GB', '512GB'].map((value) => ({ value })),
  },
  {
    name: 'Size',
    displayType: AttributeDisplayType.CHIPS,
    options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((value) => ({ value })),
  },
  { name: 'RAM', displayType: AttributeDisplayType.CHIPS, options: [] },
  { name: 'Dosage', displayType: AttributeDisplayType.CHIPS, options: [] },
  { name: 'Weight', displayType: AttributeDisplayType.CHIPS, options: [] },
  { name: 'Material', displayType: AttributeDisplayType.CHIPS, options: [] },
  { name: 'Voltage', displayType: AttributeDisplayType.CHIPS, options: [] },
]

@Injectable()
export class AttributeGroupsService {
  constructor(
    @InjectRepository(AttributeGroup)
    private readonly groupsRepo: Repository<AttributeGroup>,
    @InjectRepository(AttributeOption)
    private readonly optionsRepo: Repository<AttributeOption>,
    @InjectRepository(CategoryAttributeGroup)
    private readonly linksRepo: Repository<CategoryAttributeGroup>,
    private readonly categoriesService: CategoriesService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('AttributeGroupsService')
  }

  // ---- Groups -------------------------------------------------------------

  async listGroups(businessId: string): Promise<AttributeGroup[]> {
    try {
      const groups = await this.groupsRepo.find({
        where: { businessId, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', name: 'ASC' },
      })
      const options = await this.optionsRepo.find({
        where: { businessId, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', value: 'ASC' },
      })
      const optionsByGroup = new Map<string, AttributeOption[]>()
      for (const option of options) {
        const list = optionsByGroup.get(option.groupId) ?? []
        list.push(option)
        optionsByGroup.set(option.groupId, list)
      }
      // Category-link counts per group (for the "attached to N categories" badge).
      const linkRows = await this.linksRepo
        .createQueryBuilder('l')
        .select('l.attributeGroupId', 'gid')
        .addSelect('COUNT(*)', 'cnt')
        .where('l.businessId = :businessId', { businessId })
        .andWhere('l.deletedAt IS NULL')
        .groupBy('l.attributeGroupId')
        .getRawMany<{ gid: string; cnt: string }>()
      const countByGroup = new Map(linkRows.map((r) => [r.gid, Number(r.cnt)]))
      for (const group of groups) {
        group.options = optionsByGroup.get(group.id) ?? []
        group.categoryCount = countByGroup.get(group.id) ?? 0
      }
      return groups
    } catch (error) {
      return this.handleServiceError('listGroups', error, { businessId })
    }
  }

  async createGroup(businessId: string, dto: CreateAttributeGroupRequest): Promise<AttributeGroup> {
    try {
      await this.assertGroupNameAvailable(businessId, dto.name)
      const group = this.groupsRepo.create({
        businessId,
        name: dto.name.trim(),
        displayType: dto.displayType,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      })
      return await this.groupsRepo.save(group)
    } catch (error) {
      return this.handleServiceError('createGroup', error, { businessId, name: dto.name })
    }
  }

  async updateGroup(
    id: string,
    businessId: string,
    dto: UpdateAttributeGroupRequest,
  ): Promise<AttributeGroup> {
    try {
      const group = await this.requireGroup(id, businessId)
      if (dto.name && dto.name.trim() !== group.name) {
        await this.assertGroupNameAvailable(businessId, dto.name, id)
      }
      await this.groupsRepo.update(id, {
        name: dto.name?.trim() ?? group.name,
        displayType: dto.displayType ?? group.displayType,
        sortOrder: dto.sortOrder ?? group.sortOrder,
        isActive: dto.isActive ?? group.isActive,
      })
      return this.requireGroup(id, businessId)
    } catch (error) {
      return this.handleServiceError('updateGroup', error, { id, businessId })
    }
  }

  async removeGroup(id: string, businessId: string): Promise<void> {
    try {
      await this.requireGroup(id, businessId)
      const linkCount = await this.linksRepo.count({
        where: { attributeGroupId: id, businessId, deletedAt: IsNull() },
      })
      if (linkCount > 0) {
        throw new AppConflictException(
          await this.i18n.translate('errors.attribute_group_in_use'),
          'ATTRIBUTE_GROUP_IN_USE',
          { linkCount },
        )
      }
      // Soft-delete the group and its options.
      const now = new Date()
      await this.groupsRepo.update(id, { isActive: false, deletedAt: now })
      await this.optionsRepo.update(
        { groupId: id, businessId, deletedAt: IsNull() },
        { isActive: false, deletedAt: now },
      )
    } catch (error) {
      return this.handleServiceError('removeGroup', error, { id, businessId })
    }
  }

  // ---- Options ------------------------------------------------------------

  async listOptions(groupId: string, businessId: string): Promise<AttributeOption[]> {
    try {
      await this.requireGroup(groupId, businessId)
      return this.optionsRepo.find({
        where: { groupId, businessId, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', value: 'ASC' },
      })
    } catch (error) {
      return this.handleServiceError('listOptions', error, { groupId, businessId })
    }
  }

  /** Add an option to a group. Also the on-the-fly creation path (spec 3.5). */
  async addOption(
    groupId: string,
    businessId: string,
    dto: CreateAttributeOptionRequest,
  ): Promise<AttributeOption> {
    try {
      await this.requireGroup(groupId, businessId)
      const value = dto.value.trim()
      const existing = await this.optionsRepo.findOne({
        where: { groupId, businessId, value, deletedAt: IsNull() },
      })
      if (existing) {
        throw new AppConflictException(
          await this.i18n.translate('errors.attribute_option_exists'),
          'ATTRIBUTE_OPTION_EXISTS',
        )
      }
      const option = this.optionsRepo.create({
        groupId,
        businessId,
        value,
        colorHex: dto.colorHex ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      })
      return await this.optionsRepo.save(option)
    } catch (error) {
      return this.handleServiceError('addOption', error, { groupId, businessId })
    }
  }

  async updateOption(
    groupId: string,
    optionId: string,
    businessId: string,
    dto: UpdateAttributeOptionRequest,
  ): Promise<AttributeOption> {
    try {
      const option = await this.requireOption(groupId, optionId, businessId)
      await this.optionsRepo.update(optionId, {
        value: dto.value?.trim() ?? option.value,
        colorHex: dto.colorHex === undefined ? option.colorHex : (dto.colorHex ?? null),
        sortOrder: dto.sortOrder ?? option.sortOrder,
        isActive: dto.isActive ?? option.isActive,
      })
      return this.requireOption(groupId, optionId, businessId)
    } catch (error) {
      return this.handleServiceError('updateOption', error, { groupId, optionId, businessId })
    }
  }

  /** Soft-deactivate an option (it may be referenced by product variants in 3C). */
  async removeOption(groupId: string, optionId: string, businessId: string): Promise<void> {
    try {
      await this.requireOption(groupId, optionId, businessId)
      await this.optionsRepo.update(optionId, { isActive: false, deletedAt: new Date() })
    } catch (error) {
      return this.handleServiceError('removeOption', error, { groupId, optionId, businessId })
    }
  }

  // ---- Category links -----------------------------------------------------

  async listCategoryLinks(
    categoryId: string,
    businessId: string,
  ): Promise<CategoryAttributeGroupNode[]> {
    try {
      await this.categoriesService.findById(categoryId, businessId)
      const map = await this.getAttributeGroupsByCategory(businessId, [categoryId])
      return map.get(categoryId) ?? []
    } catch (error) {
      return this.handleServiceError('listCategoryLinks', error, { categoryId, businessId })
    }
  }

  async linkToCategory(
    categoryId: string,
    businessId: string,
    dto: LinkCategoryAttributeGroupRequest,
  ): Promise<CategoryAttributeGroup> {
    try {
      const category = await this.categoriesService.findById(categoryId, businessId)
      if (category.isLeaf === false) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.category_not_leaf'),
          'CATEGORY_NOT_LEAF',
        )
      }
      await this.requireGroup(dto.attributeGroupId, businessId)

      const existing = await this.linksRepo.findOne({
        where: {
          categoryId,
          attributeGroupId: dto.attributeGroupId,
          businessId,
          deletedAt: IsNull(),
        },
      })
      if (existing) {
        throw new AppConflictException(
          await this.i18n.translate('errors.attribute_group_already_linked'),
          'ATTRIBUTE_GROUP_ALREADY_LINKED',
        )
      }

      const link = this.linksRepo.create({
        businessId,
        categoryId,
        attributeGroupId: dto.attributeGroupId,
        isRequired: dto.isRequired ?? true,
        sortOrder: dto.sortOrder ?? 0,
      })
      return await this.linksRepo.save(link)
    } catch (error) {
      return this.handleServiceError('linkToCategory', error, { categoryId, businessId })
    }
  }

  async updateCategoryLink(
    categoryId: string,
    attributeGroupId: string,
    businessId: string,
    dto: UpdateCategoryAttributeGroupRequest,
  ): Promise<CategoryAttributeGroup> {
    try {
      const link = await this.requireLink(categoryId, attributeGroupId, businessId)
      await this.linksRepo.update(link.id, {
        isRequired: dto.isRequired ?? link.isRequired,
        sortOrder: dto.sortOrder ?? link.sortOrder,
      })
      return this.requireLink(categoryId, attributeGroupId, businessId)
    } catch (error) {
      return this.handleServiceError('updateCategoryLink', error, {
        categoryId,
        attributeGroupId,
        businessId,
      })
    }
  }

  async unlinkFromCategory(
    categoryId: string,
    attributeGroupId: string,
    businessId: string,
  ): Promise<void> {
    try {
      const link = await this.requireLink(categoryId, attributeGroupId, businessId)
      await this.linksRepo.update(link.id, { deletedAt: new Date() })
    } catch (error) {
      return this.handleServiceError('unlinkFromCategory', error, {
        categoryId,
        attributeGroupId,
        businessId,
      })
    }
  }

  // ---- Seeding ------------------------------------------------------------

  /** Idempotently seed the default attribute groups + options for a business. */
  async seedDefaults(businessId: string): Promise<void> {
    try {
      const existing = await this.groupsRepo.count({ where: { businessId } })
      if (existing > 0) {
        return
      }
      for (const [index, def] of DEFAULT_ATTRIBUTE_GROUPS.entries()) {
        const group = await this.groupsRepo.save(
          this.groupsRepo.create({
            businessId,
            name: def.name,
            displayType: def.displayType,
            sortOrder: index,
            isActive: true,
          }),
        )
        if (def.options.length > 0) {
          await this.optionsRepo.save(
            def.options.map((option, optionIndex) =>
              this.optionsRepo.create({
                groupId: group.id,
                businessId,
                value: option.value,
                colorHex: option.colorHex ?? null,
                sortOrder: optionIndex,
                isActive: true,
              }),
            ),
          )
        }
      }
    } catch (error) {
      // Seeding must never block business creation — log and continue.
      this.logger.error('Failed to seed default attribute groups', 'AttributeGroupsService', {
        businessId,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // ---- Tree integration helper -------------------------------------------

  /** Map of categoryId -> attribute group nodes (for the category tree). */
  async getAttributeGroupsByCategory(
    businessId: string,
    categoryIds: string[],
  ): Promise<Map<string, CategoryAttributeGroupNode[]>> {
    const result = new Map<string, CategoryAttributeGroupNode[]>()
    if (categoryIds.length === 0) {
      return result
    }

    const links = await this.linksRepo.find({
      where: { businessId, categoryId: In(categoryIds), deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    })
    if (links.length === 0) {
      return result
    }

    const groupIds = [...new Set(links.map((link) => link.attributeGroupId))]
    const groups = await this.groupsRepo.find({
      where: { id: In(groupIds), businessId, deletedAt: IsNull() },
    })
    const groupMap = new Map(groups.map((group) => [group.id, group]))
    const options = await this.optionsRepo.find({
      where: { groupId: In(groupIds), businessId, deletedAt: IsNull(), isActive: true },
      order: { sortOrder: 'ASC', value: 'ASC' },
    })
    const optionsByGroup = new Map<string, AttributeOption[]>()
    for (const option of options) {
      const list = optionsByGroup.get(option.groupId) ?? []
      list.push(option)
      optionsByGroup.set(option.groupId, list)
    }

    for (const link of links) {
      const group = groupMap.get(link.attributeGroupId)
      if (!group) {
        continue
      }
      const node: CategoryAttributeGroupNode = {
        id: link.id,
        attributeGroupId: group.id,
        name: group.name,
        displayType: group.displayType,
        isRequired: link.isRequired,
        sortOrder: link.sortOrder,
        options: (optionsByGroup.get(group.id) ?? []).map((option) => ({
          id: option.id,
          value: option.value,
          colorHex: option.colorHex ?? null,
        })),
      }
      const list = result.get(link.categoryId) ?? []
      list.push(node)
      result.set(link.categoryId, list)
    }
    return result
  }

  // ---- Internal helpers ---------------------------------------------------

  private async assertGroupNameAvailable(
    businessId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const where = excludeId
      ? { businessId, name: name.trim(), deletedAt: IsNull(), id: Not(excludeId) }
      : { businessId, name: name.trim(), deletedAt: IsNull() }
    const existing = await this.groupsRepo.findOne({ where })
    if (existing) {
      throw new AppConflictException(
        await this.i18n.translate('errors.attribute_group_name_exists'),
        'ATTRIBUTE_GROUP_NAME_EXISTS',
      )
    }
  }

  private async requireGroup(id: string, businessId: string): Promise<AttributeGroup> {
    const group = await this.groupsRepo.findOne({
      where: { id, businessId, deletedAt: IsNull() },
    })
    if (!group) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.attribute_group_not_found'),
        'ATTRIBUTE_GROUP_NOT_FOUND',
      )
    }
    return group
  }

  private async requireOption(
    groupId: string,
    optionId: string,
    businessId: string,
  ): Promise<AttributeOption> {
    await this.requireGroup(groupId, businessId)
    const option = await this.optionsRepo.findOne({
      where: { id: optionId, groupId, businessId, deletedAt: IsNull() },
    })
    if (!option) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.attribute_option_not_found'),
        'ATTRIBUTE_OPTION_NOT_FOUND',
      )
    }
    return option
  }

  private async requireLink(
    categoryId: string,
    attributeGroupId: string,
    businessId: string,
  ): Promise<CategoryAttributeGroup> {
    const link = await this.linksRepo.findOne({
      where: { categoryId, attributeGroupId, businessId, deletedAt: IsNull() },
    })
    if (!link) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.category_attribute_group_not_found'),
        'CATEGORY_ATTRIBUTE_GROUP_NOT_FOUND',
      )
    }
    return link
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('AttributeGroupsService error', 'AttributeGroupsService', {
        action,
        code: error.code,
        ...(metadata ?? {}),
      })
      throw error
    }
    this.logger.error('AttributeGroupsService unexpected error', 'AttributeGroupsService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })
    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'ATTRIBUTE_GROUPS_SERVICE_ERROR',
      { action },
    )
  }
}
