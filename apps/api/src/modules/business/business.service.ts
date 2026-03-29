import { Inject, Injectable } from '@nestjs/common'
import { BusinessesRepository } from './repositories/businesses.repository'
import { BusinessUsersRepository } from './repositories/business-users.repository'
import { CreateBusinessDto } from './dto/create-business.dto'
import { UpdateBusinessDto } from './dto/update-business.dto'
import { generateSlug } from '@biztrack/utils'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppConflictException,
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'

@Injectable()
export class BusinessService {
  constructor(
    private businessRepo: BusinessesRepository,
    private usersRepo: BusinessUsersRepository,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('BusinessService')
  }

  async create(ownerId: string, dto: CreateBusinessDto) {
    this.logger.debug('Create business', 'BusinessService', { ownerId, name: dto.name })

    try {
      const existing = await this.businessRepo.findOne({ where: { ownerId } })
      if (existing) {
        throw new AppConflictException('You already own a business', 'BUSINESS_ALREADY_EXISTS')
      }

      const baseSlug = generateSlug(dto.name)
      const slug = await this.generateUniqueSlug(baseSlug)

      const business = this.businessRepo.create({ ...dto, slug, ownerId })
      await this.businessRepo.save(business)

      // Link user to business
      await this.usersRepo.update(ownerId, { businessId: business.id })

      this.logger.log('Business created', 'BusinessService', { businessId: business.id, ownerId })
      return business
    } catch (error) {
      this.handleServiceError('create', error, { ownerId, name: dto.name })
    }
  }

  async findByOwner(ownerId: string) {
    this.logger.debug('Find business by owner', 'BusinessService', { ownerId })

    try {
      const business = await this.businessRepo.findOne({
        where: { ownerId },
        relations: ['members'],
      })
      if (!business) throw new AppNotFoundException('Business not found', 'BUSINESS_NOT_FOUND')
      return business
    } catch (error) {
      this.handleServiceError('findByOwner', error, { ownerId })
    }
  }

  async findById(id: string) {
    this.logger.debug('Find business by id', 'BusinessService', { id })

    try {
      const business = await this.businessRepo.findOne({ where: { id } })
      if (!business) throw new AppNotFoundException('Business not found', 'BUSINESS_NOT_FOUND')
      return business
    } catch (error) {
      this.handleServiceError('findById', error, { id })
    }
  }

  async update(id: string, ownerId: string, dto: UpdateBusinessDto) {
    this.logger.debug('Update business', 'BusinessService', { id, ownerId })

    try {
      const business = await this.businessRepo.findOne({ where: { id } })
      if (!business) throw new AppNotFoundException('Business not found', 'BUSINESS_NOT_FOUND')
      if (business.ownerId !== ownerId) {
        throw new AppForbiddenException('Not allowed to update business', 'BUSINESS_FORBIDDEN')
      }

      await this.businessRepo.update(id, dto)
      return this.businessRepo.findOne({ where: { id } })
    } catch (error) {
      this.handleServiceError('update', error, { id, ownerId })
    }
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    let slug = base
    let counter = 1
    while (await this.businessRepo.findOne({ where: { slug } })) {
      slug = `${base}-${counter++}`
    }
    return slug
  }

  private handleServiceError(action: string, error: unknown, metadata?: LogMetadata): never {
    if (error instanceof AppException) {
      this.logger.warn('BusinessService error', 'BusinessService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('BusinessService unexpected error', 'BusinessService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException('Something went wrong', 'BUSINESS_SERVICE_ERROR', {
      action,
    })
  }
}
