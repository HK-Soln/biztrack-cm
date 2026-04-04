import { Inject, Injectable } from '@nestjs/common'
import { SyncPayload, SyncResponse, ChangeSet, SyncRecord, ConflictRecord } from '@biztrack/types'
import { SyncProductsRepository } from './repositories/sync-products.repository'
import { SyncProductCategoriesRepository } from './repositories/sync-product-categories.repository'
import { SyncLogsRepository } from './repositories/sync-logs.repository'
import { Product } from '@/entities/product.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppException } from '@/common/exceptions/app.exception'
import { AppInternalServerException } from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

@Injectable()
export class SyncService {
  constructor(
    private productsRepo: SyncProductsRepository,
    private categoriesRepo: SyncProductCategoriesRepository,
    private syncLogsRepo: SyncLogsRepository,
    private i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('SyncService')
  }

  async sync(businessId: string, payload: SyncPayload): Promise<SyncResponse> {
    this.logger.debug('Sync start', 'SyncService', {
      businessId,
      deviceId: payload.deviceId,
    })

    try {
      const syncedAt = new Date()

      // 1. PUSH - apply client changes to server
      const conflicts = await this.applyClientChanges(businessId, payload.changes)

      // 2. PULL - return server changes the client hasn't seen yet
      const serverChanges = await this.getServerChanges(businessId, payload.lastSyncedAt)

      // 3. Log sync
      const log = this.syncLogsRepo.create({
        businessId,
        deviceId: payload.deviceId,
        createdAt: syncedAt,
        pushedCount: this.countChanges(payload.changes),
        pulledCount: this.countChanges(serverChanges),
        conflictCount: conflicts.length,
      })
      await this.syncLogsRepo.save(log)

      this.logger.log('Sync completed', 'SyncService', {
        businessId,
        deviceId: payload.deviceId,
        conflicts: conflicts.length,
      })

      return {
        serverChanges,
        syncedAt: syncedAt.toISOString(),
        conflicts,
      }
    } catch (error) {
      return this.handleServiceError('sync', error, {
        businessId,
        deviceId: payload.deviceId,
      })
    }
  }

  private async applyClientChanges(businessId: string, changes: ChangeSet) {
    const conflicts: ConflictRecord[] = []

    if (changes.products?.length) {
      for (const record of changes.products) {
        const conflict = await this.upsertProduct(businessId, record)
        if (conflict) conflicts.push(conflict as ConflictRecord)
      }
    }

    if (changes.productCategories?.length) {
      for (const record of changes.productCategories) {
        await this.upsertCategory(businessId, record)
      }
    }

    return conflicts
  }

  private async upsertProduct(businessId: string, record: SyncRecord) {
    const { id, updatedAt, isDeleted, ...data } = record
    const clientUpdatedAt = new Date(updatedAt)
    const deletedAt = isDeleted ? clientUpdatedAt : null

    const existing = await this.productsRepo.findOne({ where: { id, businessId } })

    if (!existing) {
      try {
        const product = this.productsRepo.create({
          id,
          businessId,
          ...data,
          updatedAt: clientUpdatedAt,
          deletedAt,
        })
        await this.productsRepo.save(product)
      } catch {
        this.logger.warn('Sync product insert race condition', 'SyncService', { id, businessId })
      }
      return null
    }

    if (clientUpdatedAt > existing.updatedAt) {
      await this.productsRepo.update(id, {
        ...data,
        updatedAt: clientUpdatedAt,
        deletedAt,
      })
      return null
    }

    if (clientUpdatedAt < existing.updatedAt) {
      return {
        id,
        entity: 'product',
        resolution: 'server_wins',
        serverVersion: this.toSyncRecord(existing),
        clientVersion: record,
      }
    }

    return null
  }

  private async upsertCategory(businessId: string, record: SyncRecord) {
    const { id, updatedAt, isDeleted, ...data } = record
    const clientUpdatedAt = new Date(updatedAt)
    const deletedAt = isDeleted ? clientUpdatedAt : null

    const existing = await this.categoriesRepo.findOne({ where: { id, businessId } })

    if (!existing) {
      try {
        const category = this.categoriesRepo.create({
          id,
          businessId,
          ...data,
          updatedAt: clientUpdatedAt,
          deletedAt,
        })
        await this.categoriesRepo.save(category)
      } catch {
        this.logger.warn('Sync category insert race condition', 'SyncService', { id, businessId })
      }
      return null
    }

    if (clientUpdatedAt > existing.updatedAt) {
      await this.categoriesRepo.update(id, {
        ...data,
        updatedAt: clientUpdatedAt,
        deletedAt,
      })
    }

    return null
  }

  private async getServerChanges(businessId: string, lastSyncedAt: string | null): Promise<ChangeSet> {
    const since = lastSyncedAt ? new Date(lastSyncedAt) : new Date(0)

    const [products, productCategories] = await Promise.all([
      this.productsRepo
        .createQueryBuilder('p')
        .withDeleted()
        .where('p.businessId = :businessId', { businessId })
        .andWhere('p.updatedAt > :since', { since })
        .getMany(),
      this.categoriesRepo
        .createQueryBuilder('c')
        .withDeleted()
        .where('c.businessId = :businessId', { businessId })
        .andWhere('c.updatedAt > :since', { since })
        .getMany(),
    ])

    return {
      products: products.map(this.toSyncRecord),
      productCategories: productCategories.map(this.toSyncRecord),
    }
  }

  private toSyncRecord(record: Product | ProductCategory): SyncRecord {
    return {
      ...record,
      updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
      createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
      deletedAt: record.deletedAt ? record.deletedAt.toISOString?.() ?? record.deletedAt : null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private countChanges(changes: ChangeSet): number {
    return Object.values(changes).reduce((sum, arr) => sum + (arr?.length ?? 0), 0)
  }

  private async handleServiceError(action: string, error: unknown, metadata?: LogMetadata): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('SyncService error', 'SyncService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('SyncService unexpected error', 'SyncService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'SYNC_SERVICE_ERROR',
      { action },
    )
  }
}
