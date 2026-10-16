import {
  buildProductSku,
  normalizeProductSku,
  PRODUCT_SKU_PATTERN,
  SKU_RANDOM_ALPHABET,
} from '@biztrack/domain'
import { Inject, Injectable } from '@nestjs/common'
import { Not } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { ProductsRepository } from '../repositories/products.repository'
import { AppBadRequestException, AppConflictException } from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

@Injectable()
export class SkuService {
  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('SkuService')
  }

  async generate(businessId: string, categorySlug?: string): Promise<string> {
    // The shape is @biztrack/domain's, the one the till uses for products made offline.
    const now = Date.now()
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const sku = buildProductSku({ categorySlug, now, random: this.randomAlphanumeric(4) })
      const exists = await this.productsRepo.findOne({ where: { businessId, sku } })
      if (!exists) return sku
    }

    throw new AppBadRequestException(
      await this.i18n.translate('errors.product_sku_generation_failed'),
      'PRODUCT_SKU_GENERATION_FAILED',
    )
  }

  async validateAndNormalize(businessId: string, sku: string, excludeProductId?: string) {
    // Shape and normalisation are @biztrack/domain's, as on the till.
    const normalized = normalizeProductSku(sku) ?? ''

    if (!PRODUCT_SKU_PATTERN.test(normalized)) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.invalid_sku_format'),
        'INVALID_SKU_FORMAT',
      )
    }

    const existing = await this.productsRepo.findOne({
      where: {
        businessId,
        sku: normalized,
        ...(excludeProductId ? { id: Not(excludeProductId) } : {}),
      },
      withDeleted: true,
    })

    if (existing) {
      throw new AppConflictException(await this.i18n.translate('errors.sku_in_use'), 'SKU_IN_USE')
    }

    return normalized
  }

  private randomAlphanumeric(length: number) {
    const alphabet = SKU_RANDOM_ALPHABET
    return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
      '',
    )
  }
}
