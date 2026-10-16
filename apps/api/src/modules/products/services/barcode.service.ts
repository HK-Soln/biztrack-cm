import { barcodeKind, normalizeBarcode } from '@biztrack/domain'
import { Inject, Injectable } from '@nestjs/common'
import { Not } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppBadRequestException, AppConflictException } from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { ProductsRepository } from '../repositories/products.repository'

export enum BarcodeType {
  EAN13 = 'EAN13',
  EAN8 = 'EAN8',
  UPCA = 'UPCA',
  CODE128 = 'CODE128',
  QR = 'QR',
  INTERNAL = 'INTERNAL',
}

@Injectable()
export class BarcodeService {
  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('BarcodeService')
  }

  /** A product given no barcode keeps none: barcodes are optional and never made up (R17). */
  none(): { value: string | null; type: BarcodeType | null; isGenerated: boolean } {
    return { value: null, type: null, isGenerated: false }
  }

  detectType(value: string): BarcodeType {
    return barcodeKind(value) as BarcodeType
  }

  async validateAndNormalize(businessId: string, barcode: string, excludeProductId?: string) {
    // Any text the shop wants; no barcode standard or check digit is required (ruling R17).
    const normalized = normalizeBarcode(barcode) ?? ''
    if (!normalized) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.invalid_barcode_check_digit'),
        'INVALID_BARCODE',
      )
    }
    const type = this.detectType(normalized)

    const existing = await this.productsRepo.findOne({
      where: {
        businessId,
        barcode: normalized,
        ...(excludeProductId ? { id: Not(excludeProductId) } : {}),
      },
      withDeleted: true,
    })

    if (existing) {
      throw new AppConflictException(
        await this.i18n.translate('errors.barcode_in_use'),
        'BARCODE_IN_USE',
      )
    }

    return {
      value: normalized,
      type,
      isGenerated: false,
    }
  }
}
