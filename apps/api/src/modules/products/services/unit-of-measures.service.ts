import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type { CreateUnitOfMeasureRequest, UnitOfMeasuresQuery } from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { Brackets, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppConflictException,
  AppInternalServerException,
} from '@/common/exceptions/app-exceptions'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'

@Injectable()
export class UnitOfMeasuresService {
  constructor(
    @InjectRepository(UnitOfMeasure)
    private readonly unitsRepo: Repository<UnitOfMeasure>,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('UnitOfMeasuresService')
  }

  async findForBusiness(businessId: string, query: UnitOfMeasuresQuery) {
    try {
      const sortField = this.validateSortField(query.sortBy)
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit
      const qb = this.unitsRepo
        .createQueryBuilder('uom')
        .where(
          new Brackets((builder) => {
            builder.where('uom.business_id IS NULL').orWhere('uom.business_id = :businessId', {
              businessId,
            })
          }),
        )

      if (query.sortBy) {
        qb.orderBy(`uom.${sortField}`, query.sortOrder ?? 'ASC').addOrderBy('uom.name', 'ASC')
      } else {
        qb.orderBy('uom.is_default', 'DESC').addOrderBy('uom.name', 'ASC')
      }

      const [data, total] = await qb.skip(skip).take(limit).getManyAndCount()

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findForBusiness', error, { businessId })
    }
  }

  private validateSortField(field?: string) {
    const allowedFields = ['name', 'abbreviation', 'type', 'createdAt', 'isDefault']
    return allowedFields.includes(field ?? '') ? field! : 'name'
  }

  async create(businessId: string, dto: CreateUnitOfMeasureRequest) {
    try {
      const existing = await this.unitsRepo
        .createQueryBuilder('uom')
        .where('uom.business_id = :businessId', { businessId })
        .andWhere('LOWER(uom.name) = LOWER(:name)', { name: dto.name.trim() })
        .getOne()

      if (existing) {
        throw new AppConflictException(
          await this.i18n.translate('errors.unit_of_measure_exists'),
          'UNIT_OF_MEASURE_EXISTS',
        )
      }

      const unit = this.unitsRepo.create({
        businessId,
        name: dto.name.trim(),
        abbreviation: dto.abbreviation.trim(),
        type: dto.type,
        isDefault: false,
      })
      return this.unitsRepo.save(unit)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, name: dto.name })
    }
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('UnitOfMeasuresService error', 'UnitOfMeasuresService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('UnitOfMeasuresService unexpected error', 'UnitOfMeasuresService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'UNIT_OF_MEASURES_SERVICE_ERROR',
      { action },
    )
  }
}
