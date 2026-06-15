import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { validate, type ValidationError } from 'class-validator'
import type {
  ChangeSet,
  ContactSyncPayload,
  ContactSyncRecord,
  DebtPaymentSyncPayload,
  DebtSyncPayload,
  DebtSyncRecord,
  ExpenseCategorySyncPayload,
  ExpenseCategorySyncRecord,
  ExpenseSyncPayload,
  ExpenseSyncRecord,
  InventoryAdjustmentSyncPayload,
  InventoryLevelSyncRecord,
  InventoryMovementSyncRecord,
  InventoryRestockSyncPayload,
  InventoryThresholdSyncPayload,
  OpeningBalanceSyncPayload,
  OpeningBalanceSyncRecord,
  RoleSyncRecord,
  SaleItemSyncRecord,
  SalePaymentSyncRecord,
  SaleSyncPayload,
  SaleSyncRecord,
  RestockItemSyncRecord,
  RestockRecordSyncRecord,
  SavingsAccountSyncPayload,
  SavingsAccountSyncRecord,
  SavingsTransactionSyncPayload,
  SavingsTransactionSyncRecord,
  SyncBatchStatus,
  SyncBatchStatusResponse,
  SyncEntity,
  SyncOperationFailureDetails,
  SyncOperationResult,
  SyncPullResponse,
  SyncPushResponse,
  SyncRecord,
  TeamMemberSyncRecord,
  JwtPayload,
} from '@biztrack/types'
import {
  AttributeDisplayType,
  ContactType,
  DebtDirection,
  DebtSource,
  DebtStatus,
  compareSyncEntityByDependency,
  deriveProductTypeFlags,
  inferProductType,
  PaymentMethod,
  ProductType,
  SerialType,
  SerialUnitStatus,
  StockAdjustmentType,
  UnitOfMeasureType,
} from '@biztrack/types'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type { Queue } from 'bullmq'
import { I18nService } from 'nestjs-i18n'
import { DataSource, In, IsNull, QueryFailedError, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { ContactOpeningBalance } from '@/entities/contact-opening-balance.entity'
import { Role } from '@/entities/role.entity'
import { Contact } from '@/entities/contact.entity'
import { Debt } from '@/entities/debt.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { ExpenseCategory } from '@/entities/expense-category.entity'
import { Expense } from '@/entities/expense.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import { Product } from '@/entities/product.entity'
import { RestockItem } from '@/entities/restock-item.entity'
import { RestockRecord } from '@/entities/restock-record.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import { Sale } from '@/entities/sale.entity'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { DepositTransaction } from '@/entities/deposit-transaction.entity'
import { SyncBatch } from '@/entities/sync-batch.entity'
import { SyncOperation } from '@/entities/sync-operation.entity'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import { AttributeGroup } from '@/entities/attribute-group.entity'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { CategoryAttributeGroup } from '@/entities/category-attribute-group.entity'
import { Brand } from '@/entities/brand.entity'
import { Model } from '@/entities/model.entity'
import { BrandCategory } from '@/entities/brand-category.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import { ProductBundleComponent } from '@/entities/product-bundle-component.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { CreateCategoryDto } from '@/modules/products/dto/create-category.dto'
import { CreateProductDto } from '@/modules/products/dto/create-product.dto'
import { CreateUnitOfMeasureDto } from '@/modules/products/dto/create-unit-of-measure.dto'
import { InventoryService } from '@/modules/inventory/services/inventory.service'
import { ProductCategoriesRepository } from '@/modules/products/repositories/product-categories.repository'
import { ProductsRepository } from '@/modules/products/repositories/products.repository'
import { StorageService } from '@/modules/storage/storage.service'
import { BarcodeService } from '@/modules/products/services/barcode.service'
import { ExpenseCategoriesService } from '@/modules/expenses/services/expense-categories.service'
import { ExpensesService } from '@/modules/expenses/services/expenses.service'
import { SlugService } from '@/modules/products/services/slug.service'
import { SkuService } from '@/modules/products/services/sku.service'
import { SalesService } from '@/modules/sales/services/sales.service'
import { DepositsService } from '@/modules/savings/services/savings.service'
import { QuotaService } from '@/modules/permissions/quota.service'
import {
  SYNC_BATCH_MAX_OPERATIONS,
  SYNC_BATCH_RECOVERY_STALE_AFTER_MS,
  SYNC_BATCHES_QUEUE,
  SYNC_PROCESS_BATCH_JOB,
} from './constants/sync.constants'
import { PushSyncBatchDto } from './dto/push-sync-batch.dto'
import { SyncRealtimeService } from './services/sync-realtime.service'

type BatchProcessingResult = {
  status: 'applied' | 'conflict' | 'deferred' | 'failed'
  resolution?: 'server_wins' | 'client_wins' | null
  errorMessage?: string | null
  errorDetails?: SyncOperationFailureDetails | null
}

type CategorySyncPayload = {
  name?: string
  description?: string | null
  isActive?: boolean
  showOnline?: boolean
  color?: string | null
  icon?: string | null
  imageUrl?: string | null
  sortOrder?: number | null
  parentId?: string | null
  depth?: number | null
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  isDeleted?: boolean
}

type AttributeGroupPayload = {
  name?: string
  displayType?: string
  sortOrder?: number | null
  isActive?: boolean
  createdAt?: string
  isDeleted?: boolean
}

type AttributeOptionPayload = {
  groupId?: string
  value?: string
  colorHex?: string | null
  sortOrder?: number | null
  isActive?: boolean
  createdAt?: string
  isDeleted?: boolean
}

type CategoryAttributeGroupPayload = {
  categoryId?: string
  attributeGroupId?: string
  isRequired?: boolean
  sortOrder?: number | null
  createdAt?: string
  isDeleted?: boolean
}

type BrandPayload = {
  name?: string
  slug?: string
  logoUrl?: string | null
  description?: string | null
  sortOrder?: number | null
  isActive?: boolean
  createdAt?: string
  isDeleted?: boolean
}

type ModelPayload = {
  brandId?: string
  name?: string
  slug?: string | null
  sortOrder?: number | null
  isActive?: boolean
  createdAt?: string
  isDeleted?: boolean
}

type BrandCategoryPayload = {
  brandId?: string
  categoryId?: string
  createdAt?: string
  isDeleted?: boolean
}

type ProductImagePayload = {
  productId?: string
  url?: string
  altText?: string | null
  sortOrder?: number | null
  createdAt?: string
  isDeleted?: boolean
}

type ProductVariantPayload = {
  productId?: string
  name?: string
  displayNameOverride?: string | null
  priceOverride?: number | null
  costPriceOverride?: number | null
  sku?: string | null
  barcode?: string | null
  isActive?: boolean
  sortOrder?: number | null
  openingStock?: number | null
  lowStockThreshold?: number | null
  createdAt?: string
  isDeleted?: boolean
}

type ProductVariantOptionPayload = {
  variantId?: string
  attributeGroupId?: string
  attributeOptionId?: string
  createdAt?: string
  isDeleted?: boolean
}

type ProductSerialUnitPayload = {
  productId?: string
  variantId?: string | null
  serialNumber?: string
  serialType?: string
  status?: string | null
  createdAt?: string
  isDeleted?: boolean
}

type ContactPayload = {
  type?: ContactType
  name?: string
  phone?: string | null
  phoneAlt?: string | null
  address?: string | null
  notes?: string | null
  isActive?: boolean
  createdById?: string | null
  createdAt?: string
  updatedAt?: string
}

type UnitSyncPayload = {
  name?: string
  abbreviation?: string | null
  businessId?: string | null
  type?: string | null
  isDefault?: boolean
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  isDeleted?: boolean
}

type ProductSyncPayload = {
  name?: string
  description?: string | null
  sku?: string | null
  barcode?: string | null
  sellingPrice?: number
  costPrice?: number | null
  taxRate?: number
  openingStock?: number | null
  currentStock?: number | null
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  unitOfMeasureId?: string | null
  categoryId?: string | null
  brandId?: string | null
  modelId?: string | null
  isFeatured?: boolean
  isPublishedOnline?: boolean
  onlineDescription?: string | null
  onlineStockReserve?: number | null
  metaTitle?: string | null
  metaDescription?: string | null
  isSerialized?: boolean
  serialType?: string | null
  warrantyMonths?: number | null
  imageUrl?: string | null
  productType?: ProductType
  isService?: boolean
  trackInventory?: boolean
  isActive?: boolean
  createdById?: string | null
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  isDeleted?: boolean
}

type DefaultUnitDescriptor = {
  name: string
  abbreviation: string
  type: UnitOfMeasureType
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PIECE_UNIT: DefaultUnitDescriptor = {
  name: 'Piece',
  abbreviation: 'pcs',
  type: UnitOfMeasureType.QUANTITY,
}

const DEFAULT_UNIT_ALIASES: Record<string, DefaultUnitDescriptor> = {
  'uom-piece': PIECE_UNIT,
  piece: PIECE_UNIT,
  pcs: PIECE_UNIT,
  pc: PIECE_UNIT,
  qty: PIECE_UNIT,
  quantity: PIECE_UNIT,
  'uom-kilogram': {
    name: 'Kilogram',
    abbreviation: 'kg',
    type: UnitOfMeasureType.WEIGHT,
  },
  kilogram: {
    name: 'Kilogram',
    abbreviation: 'kg',
    type: UnitOfMeasureType.WEIGHT,
  },
  kg: {
    name: 'Kilogram',
    abbreviation: 'kg',
    type: UnitOfMeasureType.WEIGHT,
  },
  'uom-liter': {
    name: 'Liter',
    abbreviation: 'L',
    type: UnitOfMeasureType.VOLUME,
  },
  liter: {
    name: 'Liter',
    abbreviation: 'L',
    type: UnitOfMeasureType.VOLUME,
  },
  litre: {
    name: 'Liter',
    abbreviation: 'L',
    type: UnitOfMeasureType.VOLUME,
  },
  l: {
    name: 'Liter',
    abbreviation: 'L',
    type: UnitOfMeasureType.VOLUME,
  },
  'uom-meter': {
    name: 'Meter',
    abbreviation: 'm',
    type: UnitOfMeasureType.LENGTH,
  },
  meter: {
    name: 'Meter',
    abbreviation: 'm',
    type: UnitOfMeasureType.LENGTH,
  },
  metre: {
    name: 'Meter',
    abbreviation: 'm',
    type: UnitOfMeasureType.LENGTH,
  },
  m: {
    name: 'Meter',
    abbreviation: 'm',
    type: UnitOfMeasureType.LENGTH,
  },
  'uom-service': {
    name: 'Service',
    abbreviation: 'svc',
    type: UnitOfMeasureType.CUSTOM,
  },
  service: {
    name: 'Service',
    abbreviation: 'svc',
    type: UnitOfMeasureType.CUSTOM,
  },
  svc: {
    name: 'Service',
    abbreviation: 'svc',
    type: UnitOfMeasureType.CUSTOM,
  },
}

const TERMINAL_BATCH_STATUSES = new Set<SyncBatchStatus>([
  'completed',
  'partial',
  'failed',
  'enqueue_failed',
  'skipped',
])

@Injectable()
export class SyncService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productsRepo: ProductsRepository,
    private readonly categoriesRepo: ProductCategoriesRepository,
    private readonly storage: StorageService,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(BusinessMember)
    private readonly businessMembersRepo: Repository<BusinessMember>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(ContactOpeningBalance)
    private readonly openingBalancesRepo: Repository<ContactOpeningBalance>,
    @InjectRepository(Debt)
    private readonly debtsRepo: Repository<Debt>,
    @InjectRepository(Brand)
    private readonly brandsRepo: Repository<Brand>,
    @InjectRepository(Model)
    private readonly modelsRepo: Repository<Model>,
    @InjectRepository(BrandCategory)
    private readonly brandCategoriesRepo: Repository<BrandCategory>,
    @InjectRepository(ProductImage)
    private readonly productImagesRepo: Repository<ProductImage>,
    @InjectRepository(ExpenseCategory)
    private readonly expenseCategoriesRepo: Repository<ExpenseCategory>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(InventoryLevel)
    private readonly inventoryLevelsRepo: Repository<InventoryLevel>,
    @InjectRepository(InventoryMovement)
    private readonly inventoryMovementsRepo: Repository<InventoryMovement>,
    @InjectRepository(RestockRecord)
    private readonly restockRecordsRepo: Repository<RestockRecord>,
    @InjectRepository(RestockItem)
    private readonly restockItemsRepo: Repository<RestockItem>,
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemsRepo: Repository<SaleItem>,
    @InjectRepository(SalePayment)
    private readonly salePaymentsRepo: Repository<SalePayment>,
    @InjectRepository(SyncBatch)
    private readonly syncBatchesRepo: Repository<SyncBatch>,
    @InjectRepository(SyncOperation)
    private readonly syncOperationsRepo: Repository<SyncOperation>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(UnitOfMeasure)
    private readonly unitsRepo: Repository<UnitOfMeasure>,
    @InjectRepository(AttributeGroup)
    private readonly attributeGroupsRepo: Repository<AttributeGroup>,
    @InjectRepository(AttributeOption)
    private readonly attributeOptionsRepo: Repository<AttributeOption>,
    @InjectRepository(CategoryAttributeGroup)
    private readonly categoryAttributeGroupsRepo: Repository<CategoryAttributeGroup>,
    @InjectRepository(ProductVariant)
    private readonly productVariantsRepo: Repository<ProductVariant>,
    @InjectRepository(ProductVariantOption)
    private readonly productVariantOptionsRepo: Repository<ProductVariantOption>,
    @InjectRepository(ProductBundleComponent)
    private readonly productBundleComponentsRepo: Repository<ProductBundleComponent>,
    @InjectRepository(ProductSerialUnit)
    private readonly productSerialUnitsRepo: Repository<ProductSerialUnit>,
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly expensesService: ExpensesService,
    private readonly inventoryService: InventoryService,
    private readonly salesService: SalesService,
    private readonly savingsService: DepositsService,
    private readonly quotaService: QuotaService,
    private readonly slugService: SlugService,
    private readonly skuService: SkuService,
    private readonly barcodeService: BarcodeService,
    private readonly i18n: I18nService<I18nTranslations>,
    @InjectQueue(SYNC_BATCHES_QUEUE)
    private readonly queue: Queue,
    private readonly realtime: SyncRealtimeService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('SyncService')
  }

  async enqueueBatch(
    businessId: string,
    user: JwtPayload,
    dto: PushSyncBatchDto,
  ): Promise<SyncPushResponse> {
    try {
      if (dto.operations.length === 0) {
        return {
          batchId: null,
          status: 'skipped',
          acceptedCount: 0,
        }
      }

      if (dto.operations.length > SYNC_BATCH_MAX_OPERATIONS) {
        throw new AppBadRequestException(
          `Sync batch cannot exceed ${SYNC_BATCH_MAX_OPERATIONS} operations.`,
          'SYNC_BATCH_TOO_LARGE',
          { maxOperations: SYNC_BATCH_MAX_OPERATIONS },
        )
      }

      const batch = await this.dataSource.transaction(async (manager) => {
        const batchesRepo = manager.getRepository(SyncBatch)
        const operationsRepo = manager.getRepository(SyncOperation)

        const persistedBatch = await batchesRepo.save(
          batchesRepo.create({
            businessId,
            deviceId: dto.deviceId,
            baseCursor: dto.baseCursor ? new Date(dto.baseCursor) : null,
            status: 'pending_enqueue',
            bullJobId: null,
            acceptedCount: dto.operations.length,
            processedCount: 0,
            appliedCount: 0,
            conflictCount: 0,
            failedCount: 0,
            startedAt: null,
            completedAt: null,
            lastError: null,
          }),
        )

        await operationsRepo.save(
          dto.operations.map((operation) =>
            operationsRepo.create({
              batchId: persistedBatch.id,
              businessId,
              deviceId: dto.deviceId,
              clientOperationId: operation.operationId,
              entity: operation.entity,
              action: operation.action,
              recordId: operation.recordId,
              recordUpdatedAt: new Date(operation.updatedAt),
              payload: this.prepareOperationPayload(operation.entity, operation.payload ?? null, user),
              status: 'pending',
              resolution: null,
              errorMessage: null,
              errorDetails: null,
            }),
          ),
        )

        return persistedBatch
      })

      const queuedBatch = await this.enqueuePersistedBatch(batch.id)

      if (!queuedBatch) {
        throw new AppInternalServerException(
          await this.i18n.translate('errors.server_error'),
          'SYNC_BATCH_QUEUEING_ERROR',
          { batchId: batch.id },
        )
      }

      return {
        batchId: queuedBatch.id,
        status: queuedBatch.status as SyncBatchStatus,
        acceptedCount: queuedBatch.acceptedCount,
        lastError: queuedBatch.lastError ?? null,
      }
    } catch (error) {
      return this.handleServiceError('enqueueBatch', error, {
        businessId,
        userId: user.sub,
        deviceId: dto.deviceId,
      })
    }
  }

  async getBatchStatus(
    businessId: string,
    batchId: string,
    deviceId?: string,
  ): Promise<SyncBatchStatusResponse> {
    try {
      let batch = await this.findBatchWithOperations(batchId, businessId, deviceId)

      if (!batch) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.server_error'),
          'SYNC_BATCH_NOT_FOUND',
          { batchId },
        )
      }

      batch = await this.reconcileBatchState(batch)

      return this.toBatchStatusResponse(batch)
    } catch (error) {
      return this.handleServiceError('getBatchStatus', error, { businessId, batchId })
    }
  }

  async pullChanges(
    businessId: string,
    cursor: string | null,
    _limit?: number,
  ): Promise<SyncPullResponse> {
    try {
      const since = cursor ? new Date(cursor) : new Date(0)
      const pulledAt = new Date()

      const [
        contacts,
        openingBalances,
        products,
        productCategories,
        expenseCategories,
        unitOfMeasures,
        inventoryLevels,
        inventoryMovements,
        restockRecords,
        restockItems,
        sales,
        saleItems,
        salePayments,
        debts,
        expenses,
        teamMembers,
        roles,
        attributeGroups,
        attributeOptions,
        categoryAttributeGroups,
        brands,
        models,
        brandCategories,
        productImages,
        productVariants,
        productVariantOptions,
        productBundleComponents,
        productSerialUnits,
      ] = await Promise.all([
        this.contactsRepo
          .createQueryBuilder('contact')
          .where('contact.business_id = :businessId', { businessId })
          .andWhere('contact.updated_at > :since', { since })
          .andWhere('contact.updated_at <= :pulledAt', { pulledAt })
          .orderBy('contact.updated_at', 'ASC')
          .getMany(),
        this.openingBalancesRepo
          .createQueryBuilder('ob')
          .where('ob.business_id = :businessId', { businessId })
          .andWhere('ob.updated_at > :since', { since })
          .andWhere('ob.updated_at <= :pulledAt', { pulledAt })
          .orderBy('ob.updated_at', 'ASC')
          .getMany(),
        this.productsRepo
          .createQueryBuilder('product')
          .withDeleted()
          .where('product.business_id = :businessId', { businessId })
          .andWhere('product.updated_at > :since', { since })
          .andWhere('product.updated_at <= :pulledAt', { pulledAt })
          .orderBy('product.updated_at', 'ASC')
          .getMany(),
        this.categoriesRepo
          .createQueryBuilder('category')
          .withDeleted()
          .where('category.business_id = :businessId', { businessId })
          .andWhere('category.updated_at > :since', { since })
          .andWhere('category.updated_at <= :pulledAt', { pulledAt })
          .orderBy('category.updated_at', 'ASC')
          .getMany(),
        this.expenseCategoriesRepo
          .createQueryBuilder('category')
          .withDeleted()
          .where('(category.business_id IS NULL OR category.business_id = :businessId)', { businessId })
          .andWhere('category.updated_at > :since', { since })
          .andWhere('category.updated_at <= :pulledAt', { pulledAt })
          .orderBy('category.updated_at', 'ASC')
          .getMany(),
        this.unitsRepo
          .createQueryBuilder('unit')
          .withDeleted()
          .where('(unit.business_id IS NULL OR unit.business_id = :businessId)', { businessId })
          .andWhere('unit.updated_at > :since', { since })
          .andWhere('unit.updated_at <= :pulledAt', { pulledAt })
          .orderBy('unit.updated_at', 'ASC')
          .getMany(),
        this.inventoryLevelsRepo
          .createQueryBuilder('inventory')
          .where('inventory.business_id = :businessId', { businessId })
          .andWhere('inventory.updated_at > :since', { since })
          .andWhere('inventory.updated_at <= :pulledAt', { pulledAt })
          .orderBy('inventory.updated_at', 'ASC')
          .getMany(),
        this.inventoryMovementsRepo
          .createQueryBuilder('movement')
          .leftJoinAndSelect('movement.performedBy', 'performedBy')
          .where('movement.business_id = :businessId', { businessId })
          .andWhere('movement.created_at > :since', { since })
          .andWhere('movement.created_at <= :pulledAt', { pulledAt })
          .orderBy('movement.created_at', 'ASC')
          .getMany(),
        this.restockRecordsRepo
          .createQueryBuilder('restock')
          .where('restock.business_id = :businessId', { businessId })
          .andWhere('restock.created_at > :since', { since })
          .andWhere('restock.created_at <= :pulledAt', { pulledAt })
          .orderBy('restock.created_at', 'ASC')
          .getMany(),
        this.restockItemsRepo
          .createQueryBuilder('item')
          .innerJoin('item.restockRecord', 'restockRecord')
          .where('restockRecord.business_id = :businessId', { businessId })
          .andWhere('item.created_at > :since', { since })
          .andWhere('item.created_at <= :pulledAt', { pulledAt })
          .orderBy('item.created_at', 'ASC')
          .getMany(),
        this.salesRepo
          .createQueryBuilder('sale')
          .leftJoinAndSelect('sale.cashier', 'cashier')
          .leftJoinAndSelect('sale.payments', 'payments')
          .where('sale.business_id = :businessId', { businessId })
          .andWhere('sale.updated_at > :since', { since })
          .andWhere('sale.updated_at <= :pulledAt', { pulledAt })
          .orderBy('sale.updated_at', 'ASC')
          .getMany(),
        this.saleItemsRepo
          .createQueryBuilder('saleItem')
          .where('saleItem.business_id = :businessId', { businessId })
          .andWhere('saleItem.updated_at > :since', { since })
          .andWhere('saleItem.updated_at <= :pulledAt', { pulledAt })
          .orderBy('saleItem.updated_at', 'ASC')
          .getMany(),
        this.salePaymentsRepo
          .createQueryBuilder('salePayment')
          .where('salePayment.business_id = :businessId', { businessId })
          .andWhere('salePayment.created_at > :since', { since })
          .andWhere('salePayment.created_at <= :pulledAt', { pulledAt })
          .orderBy('salePayment.created_at', 'ASC')
          .getMany(),
        this.debtsRepo
          .createQueryBuilder('debt')
          .leftJoinAndSelect('debt.payments', 'payment')
          .where('debt.business_id = :businessId', { businessId })
          .andWhere('debt.updated_at > :since', { since })
          .andWhere('debt.updated_at <= :pulledAt', { pulledAt })
          .orderBy('debt.updated_at', 'ASC')
          .addOrderBy('payment.payment_date', 'ASC')
          .addOrderBy('payment.created_at', 'ASC')
          .getMany(),
        this.expensesRepo
          .createQueryBuilder('expense')
          .withDeleted()
          .where('expense.business_id = :businessId', { businessId })
          .andWhere('expense.updated_at > :since', { since })
          .andWhere('expense.updated_at <= :pulledAt', { pulledAt })
          .orderBy('expense.updated_at', 'ASC')
          .getMany(),
        this.businessMembersRepo
          .createQueryBuilder('member')
          .leftJoinAndSelect('member.user', 'user')
          .where('member.business_id = :businessId', { businessId })
          .andWhere('member.updated_at > :since', { since })
          .andWhere('member.updated_at <= :pulledAt', { pulledAt })
          .orderBy('member.updated_at', 'ASC')
          .getMany(),
        this.rolesRepo
          .createQueryBuilder('role')
          .where('role.business_id = :businessId', { businessId })
          .andWhere('role.updated_at > :since', { since })
          .andWhere('role.updated_at <= :pulledAt', { pulledAt })
          .orderBy('role.updated_at', 'ASC')
          .getMany(),
        this.attributeGroupsRepo
          .createQueryBuilder('group')
          .withDeleted()
          .where('group.business_id = :businessId', { businessId })
          .andWhere('group.updated_at > :since', { since })
          .andWhere('group.updated_at <= :pulledAt', { pulledAt })
          .orderBy('group.updated_at', 'ASC')
          .getMany(),
        this.attributeOptionsRepo
          .createQueryBuilder('option')
          .withDeleted()
          .where('option.business_id = :businessId', { businessId })
          .andWhere('option.updated_at > :since', { since })
          .andWhere('option.updated_at <= :pulledAt', { pulledAt })
          .orderBy('option.updated_at', 'ASC')
          .getMany(),
        this.categoryAttributeGroupsRepo
          .createQueryBuilder('link')
          .withDeleted()
          .where('link.business_id = :businessId', { businessId })
          .andWhere('link.updated_at > :since', { since })
          .andWhere('link.updated_at <= :pulledAt', { pulledAt })
          .orderBy('link.updated_at', 'ASC')
          .getMany(),
        this.brandsRepo
          .createQueryBuilder('brand')
          .withDeleted()
          .where('brand.business_id = :businessId', { businessId })
          .andWhere('brand.updated_at > :since', { since })
          .andWhere('brand.updated_at <= :pulledAt', { pulledAt })
          .orderBy('brand.updated_at', 'ASC')
          .getMany(),
        this.modelsRepo
          .createQueryBuilder('model')
          .withDeleted()
          .where('model.business_id = :businessId', { businessId })
          .andWhere('model.updated_at > :since', { since })
          .andWhere('model.updated_at <= :pulledAt', { pulledAt })
          .orderBy('model.updated_at', 'ASC')
          .getMany(),
        this.brandCategoriesRepo
          .createQueryBuilder('bc')
          .withDeleted()
          .where('bc.business_id = :businessId', { businessId })
          .andWhere('bc.updated_at > :since', { since })
          .andWhere('bc.updated_at <= :pulledAt', { pulledAt })
          .orderBy('bc.updated_at', 'ASC')
          .getMany(),
        this.productImagesRepo
          .createQueryBuilder('pi')
          .withDeleted()
          .where('pi.business_id = :businessId', { businessId })
          .andWhere('pi.updated_at > :since', { since })
          .andWhere('pi.updated_at <= :pulledAt', { pulledAt })
          .orderBy('pi.updated_at', 'ASC')
          .getMany(),
        this.productVariantsRepo
          .createQueryBuilder('variant')
          .withDeleted()
          .where('variant.business_id = :businessId', { businessId })
          .andWhere('variant.updated_at > :since', { since })
          .andWhere('variant.updated_at <= :pulledAt', { pulledAt })
          .orderBy('variant.updated_at', 'ASC')
          .getMany(),
        this.productVariantOptionsRepo
          .createQueryBuilder('vopt')
          .withDeleted()
          .where('vopt.business_id = :businessId', { businessId })
          .andWhere('vopt.updated_at > :since', { since })
          .andWhere('vopt.updated_at <= :pulledAt', { pulledAt })
          .orderBy('vopt.updated_at', 'ASC')
          .getMany(),
        this.productBundleComponentsRepo
          .createQueryBuilder('bundle')
          .withDeleted()
          .where('bundle.business_id = :businessId', { businessId })
          .andWhere('bundle.updated_at > :since', { since })
          .andWhere('bundle.updated_at <= :pulledAt', { pulledAt })
          .orderBy('bundle.updated_at', 'ASC')
          .getMany(),
        // All changed serial units (any status); the device keeps only
        // IN_STOCK/RESERVED and drops the rest.
        this.productSerialUnitsRepo
          .createQueryBuilder('serial')
          .withDeleted()
          .where('serial.business_id = :businessId', { businessId })
          .andWhere('serial.updated_at > :since', { since })
          .andWhere('serial.updated_at <= :pulledAt', { pulledAt })
          .orderBy('serial.updated_at', 'ASC')
          .getMany(),
      ])

      const savingsData = await this.savingsService.findByBusiness(businessId, since, pulledAt)

      const restockQuantityMap = new Map(
        inventoryMovements
          .filter((record) => record.referenceType === 'restock' && record.referenceId)
          .map((record) => [`${record.referenceId}:${record.productId}`, record.quantityAfter] as const),
      )

      // Per-variant stock for the variant records being emitted (so the desktop's
      // denormalised variant stock stays correct across pulls).
      const variantStock = new Map<string, { quantity: number; lowStockThreshold: number | null }>()
      if (productVariants.length > 0) {
        const levels = await this.inventoryLevelsRepo.find({
          where: { businessId, variantId: In(productVariants.map((v) => v.id)) },
        })
        for (const l of levels) {
          if (l.variantId) variantStock.set(l.variantId, { quantity: l.quantity, lowStockThreshold: l.lowStockThreshold ?? null })
        }
      }

      const changes: ChangeSet = {
        contacts: contacts.map((record) => this.toContactSyncRecord(record)),
        openingBalances: openingBalances.map((record) => this.toOpeningBalanceSyncRecord(record)),
        products: products.map((record) => this.toProductSyncRecord(record)),
        productCategories: productCategories.map((record) => this.toCategorySyncRecord(record)),
        expenseCategories: expenseCategories.map((record) => this.toExpenseCategorySyncRecord(record)),
        unitOfMeasures: unitOfMeasures.map((record) => this.toUnitSyncRecord(record)),
        inventoryLevels: inventoryLevels.map((record) => this.toInventoryLevelSyncRecord(record)),
        inventoryMovements: inventoryMovements.map((record) =>
          this.toInventoryMovementSyncRecord(record),
        ),
        restockRecords: restockRecords.map((record) => this.toRestockRecordSyncRecord(record)),
        restockItems: restockItems.map((record) =>
          this.toRestockItemSyncRecord(
            record,
            restockQuantityMap.get(`${record.restockRecordId}:${record.productId}`) ?? null,
          ),
        ),
        sales: sales.map((record) => this.toSaleSyncRecord(record)),
        saleItems: saleItems.map((record) => this.toSaleItemSyncRecord(record)),
        salePayments: salePayments.map((record) => this.toSalePaymentSyncRecord(record)),
        debts: debts.map((record) => this.toDebtSyncRecord(record)),
        expenses: expenses.map((record) => this.toExpenseSyncRecord(record)),
        teamMembers: teamMembers.map((record) => this.toTeamMemberSyncRecord(record)),
        roles: roles.map((record) => this.toRoleSyncRecord(record)),
        savingsAccounts: savingsData.accounts.map((record) => this.toSavingsAccountSyncRecord(record)),
        savingsTransactions: savingsData.transactions.map((record) => this.toSavingsTransactionSyncRecord(record)),
        attributeGroups: attributeGroups.map((record) => ({
          id: record.id,
          businessId: record.businessId,
          name: record.name,
          displayType: record.displayType,
          sortOrder: record.sortOrder,
          isActive: record.isActive,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        attributeOptions: attributeOptions.map((record) => ({
          id: record.id,
          groupId: record.groupId,
          businessId: record.businessId,
          value: record.value,
          colorHex: record.colorHex ?? null,
          sortOrder: record.sortOrder,
          isActive: record.isActive,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        categoryAttributeGroups: categoryAttributeGroups.map((record) => ({
          id: record.id,
          businessId: record.businessId,
          categoryId: record.categoryId,
          attributeGroupId: record.attributeGroupId,
          isRequired: record.isRequired,
          sortOrder: record.sortOrder,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        brands: brands.map((record) => ({
          id: record.id,
          businessId: record.businessId,
          name: record.name,
          slug: record.slug,
          logoUrl: record.logoUrl ?? null,
          description: record.description ?? null,
          sortOrder: record.sortOrder,
          isActive: record.isActive,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        models: models.map((record) => ({
          id: record.id,
          businessId: record.businessId,
          brandId: record.brandId,
          name: record.name,
          slug: record.slug ?? null,
          sortOrder: record.sortOrder,
          isActive: record.isActive,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        brandCategories: brandCategories.map((record) => ({
          id: record.id,
          businessId: record.businessId,
          brandId: record.brandId,
          categoryId: record.categoryId,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        productImages: productImages.map((record) => ({
          id: record.id,
          businessId: record.businessId ?? null,
          productId: record.productId,
          url: record.url,
          altText: record.altText ?? null,
          sortOrder: record.sortOrder,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        productVariants: productVariants.map((record) => ({
          id: record.id,
          businessId: record.businessId,
          productId: record.productId,
          name: record.name,
          displayNameOverride: record.displayNameOverride ?? null,
          priceOverride: record.priceOverride ?? null,
          costPriceOverride: record.costPriceOverride ?? null,
          sku: record.sku ?? null,
          barcode: record.barcode ?? null,
          isActive: record.isActive,
          sortOrder: record.sortOrder,
          stockQuantity: variantStock.get(record.id)?.quantity ?? 0,
          lowStockThreshold: variantStock.get(record.id)?.lowStockThreshold ?? null,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        productVariantOptions: productVariantOptions.map((record) => ({
          id: record.id,
          variantId: record.variantId,
          attributeGroupId: record.attributeGroupId,
          attributeOptionId: record.attributeOptionId,
          businessId: record.businessId,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        productBundleComponents: productBundleComponents.map((record) => ({
          id: record.id,
          businessId: record.businessId,
          bundleProductId: record.bundleProductId,
          componentProductId: record.componentProductId,
          quantity: record.quantity,
          sortOrder: record.sortOrder,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
        productSerialUnits: productSerialUnits.map((record) => ({
          id: record.id,
          businessId: record.businessId,
          productId: record.productId,
          variantId: record.variantId ?? null,
          serialNumber: record.serialNumber,
          serialType: record.serialType,
          status: record.status,
          warrantyExpiresAt: record.warrantyExpiresAt?.toISOString() ?? null,
          reservedAt: record.reservedAt?.toISOString() ?? null,
          reservedBy: record.reservedBy ?? null,
          createdAt: record.createdAt?.toISOString?.() ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
          isDeleted: record.deletedAt != null,
        })),
      }

      return {
        changes,
        cursor: pulledAt.toISOString(),
      }
    } catch (error) {
      return this.handleServiceError('pullChanges', error, { businessId, cursor })
    }
  }

  async processBatch(batchId: string): Promise<void> {
    const batch = await this.findBatchWithOperations(batchId)
    if (!batch || TERMINAL_BATCH_STATUSES.has(batch.status as SyncBatchStatus)) {
      this.logger.warn('Batch not found or already in terminal status, skipping processing', 'SyncService', { batchId })
      return
    }

    await this.syncBatchesRepo.update(batch.id, {
      status: 'processing',
      startedAt: batch.startedAt ?? new Date(),
      lastError: null,
    })

    await this.emitBatchStatus(batch.id)

    // Process parents before children, driven by the shared dependency graph (the
    // same one the client orders its push with), then oldest-first. Defensive: the
    // client already sends in this order.
    const sortedOperations = [...(batch.operations ?? [])].sort((left, right) => {
      const dependencyOrder = compareSyncEntityByDependency(
        left.entity as SyncEntity,
        right.entity as SyncEntity,
      )
      if (dependencyOrder !== 0) {
        return dependencyOrder
      }

      const recordUpdatedAtOrder = left.recordUpdatedAt.getTime() - right.recordUpdatedAt.getTime()
      if (recordUpdatedAtOrder !== 0) {
        return recordUpdatedAtOrder
      }

      const createdAtOrder = left.createdAt.getTime() - right.createdAt.getTime()
      if (createdAtOrder !== 0) {
        return createdAtOrder
      }

      return left.id.localeCompare(right.id)
    })

    let processedCount = 0
    let appliedCount = 0
    let conflictCount = 0
    let failedCount = 0
    let firstFailureMessage: string | null = null

    // Buffer per-operation status writes and flush them grouped by outcome, so the
    // common "applied" majority is persisted in a single UPDATE ... WHERE id IN (...)
    // instead of one UPDATE per operation (previously an N+1 over the batch). The
    // catch path flushes whatever was computed before marking the rest failed, so
    // crash-recovery semantics are unchanged (markPendingOperationsFailed only
    // touches rows still 'pending').
    const operationResults: Array<{ id: string; result: BatchProcessingResult }> = []

    const flushOperationResults = async () => {
      if (operationResults.length === 0) {
        return
      }

      const groups = new Map<string, { update: Record<string, unknown>; ids: string[] }>()
      for (const { id, result } of operationResults) {
        const update = {
          status: result.status,
          resolution: result.resolution ?? null,
          errorMessage: result.errorMessage ?? null,
          errorDetails: result.errorDetails ? { ...result.errorDetails } : null,
        }
        const key = JSON.stringify(update)
        const group = groups.get(key)
        if (group) {
          group.ids.push(id)
        } else {
          groups.set(key, { update, ids: [id] })
        }
      }

      operationResults.length = 0

      for (const { update, ids } of groups.values()) {
        await this.syncOperationsRepo.update({ id: In(ids) }, update as never)
      }
    }

    try {
      for (const operation of sortedOperations) {
        if (operation.status !== 'pending') {
          processedCount += 1
          if (operation.status === 'applied') appliedCount += 1
          if (operation.status === 'conflict') conflictCount += 1
          if (operation.status === 'failed') failedCount += 1
          continue
        }

        const result = await this.processOperation(batch.businessId, operation)
        processedCount += 1

        if (result.status === 'applied') {
          appliedCount += 1
        } else if (result.status === 'conflict') {
          conflictCount += 1
        } else if (result.status === 'deferred') {
          // Not a failure — the client keeps the record and retries once its
          // dependency lands. Leaves the batch 'partial' (not 'failed').
        } else {
          failedCount += 1
          firstFailureMessage ??= result.errorMessage ?? null
        }

        operationResults.push({ id: operation.id, result })
      }

      await flushOperationResults()

      const status = this.resolveBatchStatus(processedCount, appliedCount, failedCount)

      await this.syncBatchesRepo.update(batch.id, {
        status,
        processedCount,
        appliedCount,
        conflictCount,
        failedCount,
        completedAt: new Date(),
        lastError: firstFailureMessage,
      })

      // Metrics: one structured line per processed batch (deferred is whatever wasn't
      // applied/conflict/failed).
      this.logger.log('Sync batch processed', 'SyncService', {
        batchId: batch.id,
        businessId: batch.businessId,
        status,
        processed: processedCount,
        applied: appliedCount,
        conflict: conflictCount,
        deferred: processedCount - appliedCount - conflictCount - failedCount,
        failed: failedCount,
      })

      await this.emitBatchStatus(batch.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected sync batch processing failure.'
      this.logger.error('Sync batch processing failed', 'SyncService', { batchId: batch.id, message })

      await flushOperationResults()
      await this.markPendingOperationsFailed(batch.id, message)
      await this.finalizeBatchFromPersistedOperations(batch.id, message)
      await this.emitBatchStatus(batch.id)

      throw error
    }
  }

  async recoverNonTerminalBatches(limit = 25): Promise<void> {
    const staleBefore = new Date(Date.now() - SYNC_BATCH_RECOVERY_STALE_AFTER_MS)

    const batches = await this.syncBatchesRepo
      .createQueryBuilder('batch')
      .where('batch.status IN (:...statuses)', {
        statuses: ['pending_enqueue', 'queued', 'processing'],
      })
      .andWhere('batch.created_at <= :staleBefore', { staleBefore })
      .orderBy('batch.created_at', 'ASC')
      .limit(limit)
      .getMany()

    for (const batch of batches) {
      try {
        await this.reconcileBatchState(batch)
      } catch (error) {
        this.logger.warn('Unable to reconcile non-terminal sync batch', 'SyncService', {
          batchId: batch.id,
          businessId: batch.businessId,
          message: error instanceof Error ? error.message : 'Unknown recovery error',
        })
      }
    }
  }

  // Entity → apply handler. Replaces the per-entity switch: adding an entity is one
  // line here. Ordering (dependency graph) + error classification live in the generic
  // processOperation below, so handlers only do the per-entity persistence.
  private get operationHandlers(): Record<
    string,
    (businessId: string, operation: SyncOperation) => Promise<BatchProcessingResult>
  > {
    return {
      product_category: (b, o) => this.applyCategoryOperation(b, o),
      attribute_group: (b, o) => this.applyAttributeGroupOperation(b, o),
      attribute_option: (b, o) => this.applyAttributeOptionOperation(b, o),
      category_attribute_group: (b, o) => this.applyCategoryAttributeGroupOperation(b, o),
      brand: (b, o) => this.applyBrandOperation(b, o),
      model: (b, o) => this.applyModelOperation(b, o),
      brand_category: (b, o) => this.applyBrandCategoryOperation(b, o),
      product_image: (b, o) => this.applyProductImageOperation(b, o),
      product_variant: (b, o) => this.applyProductVariantOperation(b, o),
      product_variant_option: (b, o) => this.applyProductVariantOptionOperation(b, o),
      product_serial_unit: (b, o) => this.applyProductSerialUnitOperation(b, o),
      contact: (b, o) => this.applyContactOperation(b, o),
      opening_balance: (b, o) => this.applyOpeningBalanceOperation(b, o),
      product: (b, o) => this.applyProductOperation(b, o),
      expense_category: (b, o) => this.applyExpenseCategoryOperation(b, o),
      unit_of_measure: (b, o) => this.applyUnitOfMeasureOperation(b, o),
      inventory_threshold: (b, o) => this.applyInventoryThresholdOperation(b, o),
      inventory_adjustment: (b, o) => this.applyInventoryAdjustmentOperation(b, o),
      inventory_restock: (b, o) => this.applyInventoryRestockOperation(b, o),
      sale: (b, o) => this.applySaleOperation(b, o),
      debt: (b, o) => this.applyDebtOperation(b, o),
      expense: (b, o) => this.applyExpenseOperation(b, o),
      savings: (b, o) => this.applySavingsAccountOperation(b, o),
      savings_transaction: (b, o) => this.applySavingsTransactionOperation(b, o),
    }
  }

  private async processOperation(businessId: string, operation: SyncOperation): Promise<BatchProcessingResult> {
    // Idempotency: if this exact client operation was already applied in a prior batch
    // (e.g. the client resent it after missing the ack), skip — avoids double side
    // effects for non-idempotent ops like sales/inventory movements.
    if (await this.isDuplicateOfApplied(operation)) {
      return { status: 'applied' }
    }

    const handler = this.operationHandlers[operation.entity]
    if (!handler) {
      return { status: 'failed', errorMessage: `Unsupported sync entity: ${operation.entity}` }
    }
    try {
      return await handler(businessId, operation)
    } catch (error) {
      return this.classifyOperationError(businessId, operation, error)
    }
  }

  /** True if another operation with the same client operation id + device already applied. */
  private async isDuplicateOfApplied(operation: SyncOperation): Promise<boolean> {
    const prior = await this.syncOperationsRepo.findOne({
      where: {
        deviceId: operation.deviceId,
        clientOperationId: operation.clientOperationId,
        status: 'applied',
      },
    })
    return Boolean(prior && prior.id !== operation.id)
  }

  /**
   * Map a thrown error to a per-record outcome so one bad operation never fails the
   * whole batch:
   * - FK violation (PG 23503): the parent isn't on the server yet → 'deferred'
   *   (the client retries once the parent syncs).
   * - NotFound during apply: the apply methods upsert the record itself, so a
   *   not-found here is always a referenced parent (FK dependency) → 'deferred'.
   * - Unique violation (PG 23505): a record already exists for this key → 'conflict'.
   * - AppException: an intentional rejection (quota/validation) → 'failed' with its code.
   * - Anything else: 'failed'.
   */
  private classifyOperationError(
    businessId: string,
    operation: SyncOperation,
    error: unknown,
  ): BatchProcessingResult {
    if (error instanceof QueryFailedError) {
      const code = (error.driverError as { code?: string } | undefined)?.code
      if (code === '23503') {
        return {
          status: 'deferred',
          errorMessage: 'A dependency has not synced yet; will retry.',
          errorDetails: { code: 'DEPENDENCY_MISSING' },
        }
      }
      if (code === '23505') {
        return {
          status: 'conflict',
          resolution: 'server_wins',
          errorMessage: 'A record already exists for this key.',
          errorDetails: { code: 'UNIQUE_VIOLATION' },
        }
      }
    }

    if (error instanceof AppNotFoundException) {
      return {
        status: 'deferred',
        errorMessage: error.message,
        errorDetails: { code: 'DEPENDENCY_MISSING' },
      }
    }

    if (error instanceof AppException) {
      return {
        status: 'failed',
        errorMessage: error.message,
        errorDetails: (error.details as SyncOperationFailureDetails | undefined) ?? null,
      }
    }

    this.logger.error('Sync operation failed unexpectedly', 'SyncService', {
      businessId,
      operationId: operation.id,
      entity: operation.entity,
      message: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unexpected sync failure',
      errorDetails: null,
    }
  }

  private async applyCategoryOperation(businessId: string, operation: SyncOperation): Promise<BatchProcessingResult> {
    const existing = await this.categoriesRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.categoriesRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }

      return { status: 'applied' }
    }

    const payload = this.readCategoryPayload(operation.payload)
    const dto = plainToInstance(CreateCategoryDto, {
      name: payload.name,
      description: payload.description ?? undefined,
      color: payload.color ?? undefined,
      icon: payload.icon ?? undefined,
      imageUrl: payload.imageUrl ?? undefined,
      sortOrder: payload.sortOrder ?? undefined,
      showOnline: payload.showOnline ?? undefined,
    })
    await this.ensureValidDto(dto)

    const slug = await this.slugService.generateCategorySlug(payload.name!, businessId, existing?.id)

    // Resolve hierarchy: prefer the authoritative depth from the parent when it's
    // present; otherwise trust the client's computed depth (the parent FK will defer
    // the op if the parent genuinely hasn't synced yet).
    const parentId = this.normalizeOptionalString(payload.parentId)
    let depth = payload.depth ?? 1
    if (parentId) {
      const parent = await this.categoriesRepo.findOne({ where: { id: parentId, businessId } })
      if (parent) depth = parent.depth + 1
    }

    if (existing) {
      const nextIsActive = payload.isActive ?? existing.isActive
      const reactivatesQuotaConsumer =
        nextIsActive && (existing.deletedAt !== null || existing.isActive === false)

      // Sync is a second write path into the same business data. We enforce
      // the quota here as well so an offline device cannot bypass the limits
      // that the online controller/service path would apply.
      if (reactivatesQuotaConsumer) {
        await this.quotaService.assertWithinQuota(businessId, 'categories')
      }

      await this.categoriesRepo.update(operation.recordId, {
        name: payload.name!.trim(),
        slug,
        description: this.normalizeOptionalString(payload.description),
        isActive: nextIsActive,
        showOnline: payload.showOnline ?? existing.showOnline,
        color: this.normalizeOptionalString(payload.color),
        icon: this.normalizeOptionalString(payload.icon),
        imageUrl: this.sanitizeStoredImageUrl(payload.imageUrl),
        sortOrder: payload.sortOrder ?? 0,
        parentId,
        depth,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    if (payload.isActive ?? true) {
      await this.quotaService.assertWithinQuota(businessId, 'categories')
    }

    await this.categoriesRepo.save(
      this.categoriesRepo.create({
        id: operation.recordId,
        businessId,
        name: payload.name!.trim(),
        slug,
        description: this.normalizeOptionalString(payload.description),
        isActive: payload.isActive ?? true,
        showOnline: payload.showOnline ?? true,
        color: this.normalizeOptionalString(payload.color),
        icon: this.normalizeOptionalString(payload.icon),
        imageUrl: this.sanitizeStoredImageUrl(payload.imageUrl),
        sortOrder: payload.sortOrder ?? 0,
        parentId,
        depth,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )

    return { status: 'applied' }
  }

  private async applyAttributeGroupOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.attributeGroupsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.attributeGroupsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readAttributeGroupPayload(operation.payload)
    const displayType = this.normalizeDisplayType(payload.displayType)

    if (existing) {
      await this.attributeGroupsRepo.update(operation.recordId, {
        name: payload.name!.trim(),
        displayType,
        sortOrder: payload.sortOrder ?? existing.sortOrder,
        isActive: payload.isActive ?? existing.isActive,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.attributeGroupsRepo.save(
      this.attributeGroupsRepo.create({
        id: operation.recordId,
        businessId,
        name: payload.name!.trim(),
        displayType,
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyAttributeOptionOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.attributeOptionsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.attributeOptionsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readAttributeOptionPayload(operation.payload)
    // Ownership: the parent group must belong to this business (also enforces the FK
    // dependency — a missing group surfaces as a deferrable FK error).
    const groupId = payload.groupId ?? existing?.groupId
    if (!groupId) {
      throw new AppBadRequestException('Attribute option requires a groupId.', 'SYNC_OPTION_GROUP_REQUIRED')
    }

    if (existing) {
      await this.attributeOptionsRepo.update(operation.recordId, {
        groupId,
        value: payload.value!.trim(),
        colorHex: this.normalizeOptionalString(payload.colorHex),
        sortOrder: payload.sortOrder ?? existing.sortOrder,
        isActive: payload.isActive ?? existing.isActive,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.attributeOptionsRepo.save(
      this.attributeOptionsRepo.create({
        id: operation.recordId,
        businessId,
        groupId,
        value: payload.value!.trim(),
        colorHex: this.normalizeOptionalString(payload.colorHex),
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyCategoryAttributeGroupOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.categoryAttributeGroupsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        // Link records are hard concepts but soft-deleted for sync convergence.
        await this.categoryAttributeGroupsRepo.update(operation.recordId, {
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readCategoryAttributeGroupPayload(operation.payload)
    const categoryId = payload.categoryId ?? existing?.categoryId
    const attributeGroupId = payload.attributeGroupId ?? existing?.attributeGroupId
    if (!categoryId || !attributeGroupId) {
      throw new AppBadRequestException(
        'Category attribute link requires categoryId and attributeGroupId.',
        'SYNC_CATEGORY_ATTR_LINK_INVALID',
      )
    }

    if (existing) {
      await this.categoryAttributeGroupsRepo.update(operation.recordId, {
        categoryId,
        attributeGroupId,
        isRequired: payload.isRequired ?? existing.isRequired,
        sortOrder: payload.sortOrder ?? existing.sortOrder,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.categoryAttributeGroupsRepo.save(
      this.categoryAttributeGroupsRepo.create({
        id: operation.recordId,
        businessId,
        categoryId,
        attributeGroupId,
        isRequired: payload.isRequired ?? true,
        sortOrder: payload.sortOrder ?? 0,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyBrandOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.brandsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.brandsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readBrandPayload(operation.payload)
    const slug = payload.slug?.trim() || this.slugify(payload.name!)

    if (existing) {
      await this.brandsRepo.update(operation.recordId, {
        name: payload.name!.trim(),
        slug,
        logoUrl: this.sanitizeStoredImageUrl(payload.logoUrl),
        description: this.normalizeOptionalString(payload.description),
        sortOrder: payload.sortOrder ?? existing.sortOrder,
        isActive: payload.isActive ?? existing.isActive,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.brandsRepo.save(
      this.brandsRepo.create({
        id: operation.recordId,
        businessId,
        name: payload.name!.trim(),
        slug,
        logoUrl: this.sanitizeStoredImageUrl(payload.logoUrl),
        description: this.normalizeOptionalString(payload.description),
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyModelOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.modelsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.modelsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readModelPayload(operation.payload)
    const brandId = payload.brandId ?? existing?.brandId
    if (!brandId) {
      throw new AppBadRequestException('Model requires a brandId.', 'SYNC_MODEL_BRAND_REQUIRED')
    }

    if (existing) {
      await this.modelsRepo.update(operation.recordId, {
        brandId,
        name: payload.name!.trim(),
        slug: this.normalizeOptionalString(payload.slug),
        sortOrder: payload.sortOrder ?? existing.sortOrder,
        isActive: payload.isActive ?? existing.isActive,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.modelsRepo.save(
      this.modelsRepo.create({
        id: operation.recordId,
        businessId,
        brandId,
        name: payload.name!.trim(),
        slug: this.normalizeOptionalString(payload.slug),
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyBrandCategoryOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.brandCategoriesRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.brandCategoriesRepo.update(operation.recordId, {
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readBrandCategoryPayload(operation.payload)
    const brandId = payload.brandId ?? existing?.brandId
    const categoryId = payload.categoryId ?? existing?.categoryId
    if (!brandId || !categoryId) {
      throw new AppBadRequestException(
        'Brand-category link requires brandId and categoryId.',
        'SYNC_BRAND_CATEGORY_INVALID',
      )
    }

    if (existing) {
      await this.brandCategoriesRepo.update(operation.recordId, {
        brandId,
        categoryId,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.brandCategoriesRepo.save(
      this.brandCategoriesRepo.create({
        id: operation.recordId,
        businessId,
        brandId,
        categoryId,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyProductImageOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.productImagesRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.productImagesRepo.update(operation.recordId, {
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readProductImagePayload(operation.payload)
    const productId = payload.productId ?? existing?.productId
    if (!productId) {
      throw new AppBadRequestException('Product image requires a productId.', 'SYNC_PRODUCT_IMAGE_PRODUCT_REQUIRED')
    }

    if (existing) {
      await this.productImagesRepo.update(operation.recordId, {
        productId,
        url: payload.url!.trim(),
        altText: this.normalizeOptionalString(payload.altText),
        sortOrder: payload.sortOrder ?? existing.sortOrder,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.productImagesRepo.save(
      this.productImagesRepo.create({
        id: operation.recordId,
        businessId,
        productId,
        url: payload.url!.trim(),
        altText: this.normalizeOptionalString(payload.altText),
        sortOrder: payload.sortOrder ?? 0,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyProductVariantOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.productVariantsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.productVariantsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readProductVariantPayload(operation.payload)
    const productId = payload.productId ?? existing?.productId
    if (!productId) {
      throw new AppBadRequestException('Product variant requires a productId.', 'SYNC_VARIANT_PRODUCT_REQUIRED')
    }
    const fields = {
      productId,
      name: payload.name!.trim(),
      displayNameOverride: this.normalizeOptionalString(payload.displayNameOverride),
      priceOverride: payload.priceOverride ?? null,
      costPriceOverride: payload.costPriceOverride ?? null,
      sku: this.normalizeOptionalString(payload.sku),
      barcode: this.normalizeOptionalString(payload.barcode),
      isActive: payload.isActive ?? existing?.isActive ?? true,
      sortOrder: payload.sortOrder ?? existing?.sortOrder ?? 0,
    }

    if (existing) {
      await this.productVariantsRepo.update(operation.recordId, {
        ...fields,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.productVariantsRepo.save(
      this.productVariantsRepo.create({
        id: operation.recordId,
        businessId,
        ...fields,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    // Seed the variant's inventory level from opening stock (non-serialised products).
    const parentProduct = await this.productsRepo.findOne({ where: { id: productId, businessId } })
    if (parentProduct && !parentProduct.isSerialized && parentProduct.trackInventory) {
      const level = await this.inventoryLevelsRepo.findOne({ where: { businessId, productId, variantId: operation.recordId } })
      if (!level) {
        await this.inventoryLevelsRepo.save(
          this.inventoryLevelsRepo.create({
            businessId,
            productId,
            variantId: operation.recordId,
            quantity: Math.max(payload.openingStock ?? 0, 0),
            lowStockThreshold: payload.lowStockThreshold ?? null,
          }),
        )
      } else if (payload.lowStockThreshold !== undefined) {
        await this.inventoryLevelsRepo.update(level.id, { lowStockThreshold: payload.lowStockThreshold })
      }
    }
    return { status: 'applied' }
  }

  private async applyProductVariantOptionOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.productVariantOptionsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.productVariantOptionsRepo.update(operation.recordId, {
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readProductVariantOptionPayload(operation.payload)
    const variantId = payload.variantId ?? existing?.variantId
    const attributeGroupId = payload.attributeGroupId ?? existing?.attributeGroupId
    const attributeOptionId = payload.attributeOptionId ?? existing?.attributeOptionId
    if (!variantId || !attributeGroupId || !attributeOptionId) {
      throw new AppBadRequestException(
        'Variant option requires variantId, attributeGroupId and attributeOptionId.',
        'SYNC_VARIANT_OPTION_INVALID',
      )
    }

    if (existing) {
      await this.productVariantOptionsRepo.update(operation.recordId, {
        variantId,
        attributeGroupId,
        attributeOptionId,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.productVariantOptionsRepo.save(
      this.productVariantOptionsRepo.create({
        id: operation.recordId,
        businessId,
        variantId,
        attributeGroupId,
        attributeOptionId,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyProductSerialUnitOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.productSerialUnitsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.productSerialUnitsRepo.update(operation.recordId, {
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }
      return { status: 'applied' }
    }

    const payload = this.readProductSerialUnitPayload(operation.payload)
    const productId = payload.productId ?? existing?.productId
    const serialNumber = (payload.serialNumber ?? existing?.serialNumber)?.trim()
    const serialType = (payload.serialType ?? existing?.serialType) as SerialType | undefined
    if (!productId || !serialNumber || !serialType) {
      throw new AppBadRequestException(
        'Serial unit requires productId, serialNumber and serialType.',
        'SYNC_SERIAL_UNIT_INVALID',
      )
    }

    const variantId =
      payload.variantId === undefined ? existing?.variantId ?? null : payload.variantId
    const status = (payload.status ?? existing?.status ?? SerialUnitStatus.IN_STOCK) as SerialUnitStatus

    if (existing) {
      await this.productSerialUnitsRepo.update(operation.recordId, {
        productId,
        variantId,
        serialNumber,
        serialType,
        status,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.productSerialUnitsRepo.save(
      this.productSerialUnitsRepo.create({
        id: operation.recordId,
        businessId,
        productId,
        variantId,
        serialNumber,
        serialType,
        status,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )
    return { status: 'applied' }
  }

  private async applyContactOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.contactsRepo.findOne({
      where: { id: operation.recordId, businessId },
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (operation.action === 'DELETE') {
      if (existing) {
        await this.contactsRepo.update(operation.recordId, {
          isActive: false,
          updatedAt: operation.recordUpdatedAt,
        })
      }

      return { status: 'applied' }
    }

    const payload = this.readContactPayload(operation.payload)
    const normalizedName = payload.name?.trim() || ''
    if (!normalizedName) {
      throw new AppBadRequestException('Contact name is required.', 'CONTACT_NAME_REQUIRED')
    }

    const createdById = await this.resolveContactCreatedById(businessId, payload.createdById)

    if (existing) {
      const nextIsActive = payload.isActive ?? existing.isActive
      const reactivatesQuotaConsumer = nextIsActive && existing.isActive === false

      // Contacts can be created offline and later pushed through sync. We
      // repeat the quota check here so "reactivate while offline" behaves the
      // same as "reactivate through the regular API".
      if (reactivatesQuotaConsumer) {
        await this.quotaService.assertWithinQuota(businessId, 'contacts')
      }

      await this.contactsRepo.update(operation.recordId, {
        type: payload.type ?? existing.type,
        name: normalizedName,
        phone: this.normalizeOptionalString(payload.phone),
        phoneAlt: this.normalizeOptionalString(payload.phoneAlt),
        address: this.normalizeOptionalString(payload.address),
        notes: this.normalizeOptionalString(payload.notes),
        isActive: nextIsActive,
        updatedAt: operation.recordUpdatedAt,
      })

      return { status: 'applied' }
    }

    if (payload.isActive ?? true) {
      await this.quotaService.assertWithinQuota(businessId, 'contacts')
    }

    await this.contactsRepo.save(
      this.contactsRepo.create({
        id: operation.recordId,
        businessId,
        type: payload.type ?? ContactType.CUSTOMER,
        name: normalizedName,
        phone: this.normalizeOptionalString(payload.phone),
        phoneAlt: this.normalizeOptionalString(payload.phoneAlt),
        address: this.normalizeOptionalString(payload.address),
        notes: this.normalizeOptionalString(payload.notes),
        isActive: payload.isActive ?? true,
        createdById,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )

    return { status: 'applied' }
  }

  private async applyOpeningBalanceOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const payload = this.readOpeningBalancePayload(operation.payload)

    const existing = await this.openingBalancesRepo.findOne({
      where: { businessId, contactId: payload.contactId, direction: payload.direction as DebtDirection },
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return { status: 'conflict', resolution: 'server_wins' }
    }

    if (operation.action === 'DELETE') {
      if (existing) {
        await this.openingBalancesRepo.delete(existing.id)
      }
      return { status: 'applied' }
    }

    const contact = await this.contactsRepo.findOne({
      where: { id: payload.contactId, businessId },
      select: ['id', 'businessId'],
    })

    if (!contact) {
      return { status: 'failed', errorMessage: 'Opening balance contact could not be resolved.' }
    }

    const amount = this.normalizeMoney(payload.amount)
    if (amount <= 0) {
      return { status: 'failed', errorMessage: 'Opening balance amount must be greater than zero.' }
    }

    if (existing) {
      await this.openingBalancesRepo.update(existing.id, {
        amount,
        asOfDate: payload.asOfDate,
        notes: this.normalizeOptionalString(payload.notes),
        recordedById: this.normalizeOptionalString(payload.recordedById),
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.openingBalancesRepo.save(
      this.openingBalancesRepo.create({
        id: operation.recordId,
        businessId,
        contactId: payload.contactId,
        direction: payload.direction as DebtDirection,
        amount,
        asOfDate: payload.asOfDate,
        notes: this.normalizeOptionalString(payload.notes),
        recordedById: this.normalizeOptionalString(payload.recordedById),
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )

    return { status: 'applied' }
  }

  private async applyExpenseCategoryOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.expenseCategoriesRepo.findOne({
      where: { id: operation.recordId },
      withDeleted: true,
    })

    if (existing?.businessId === null) {
      return {
        status: 'failed',
        errorMessage: 'System expense categories are pull-only.',
      }
    }

    if (existing?.businessId && existing.businessId !== businessId) {
      return {
        status: 'failed',
        errorMessage: 'Expense category belongs to another business.',
      }
    }

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    const payload =
      operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)
        ? ((operation.payload ?? {}) as unknown as ExpenseCategorySyncPayload)
        : this.readExpenseCategoryPayload(operation.payload)

    await this.expenseCategoriesService.upsertFromSync(
      operation.recordId,
      businessId,
      payload,
      operation.action as 'UPSERT' | 'DELETE',
      operation.recordUpdatedAt,
    )

    return { status: 'applied' }
  }

  private async applyUnitOfMeasureOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.unitsRepo.findOne({
      where: { id: operation.recordId },
      withDeleted: true,
    })

    if (existing?.businessId === null) {
      return {
        status: 'failed',
        errorMessage: 'System units of measure are pull-only.',
      }
    }

    if (existing?.businessId && existing.businessId !== businessId) {
      return {
        status: 'failed',
        errorMessage: 'Unit of measure belongs to another business.',
      }
    }

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.unitsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }

      return { status: 'applied' }
    }

    const payload = this.readUnitPayload(operation.payload)
    const dto = plainToInstance(CreateUnitOfMeasureDto, {
      name: payload.name,
      abbreviation: payload.abbreviation,
      type: payload.type,
    })
    await this.ensureValidDto(dto)

    if (existing) {
      await this.unitsRepo.update(operation.recordId, {
        name: payload.name!.trim().toUpperCase(),
        abbreviation: payload.abbreviation?.trim() ?? '',
        type: payload.type! as UnitOfMeasureType,
        businessId,
        isDefault: Boolean(payload.isDefault),
        isActive: payload.isActive ?? true,
        deletedAt: null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.unitsRepo.save(
      this.unitsRepo.create({
        id: operation.recordId,
        name: payload.name!.trim().toUpperCase(),
        abbreviation: payload.abbreviation?.trim() ?? '',
        businessId,
        type: payload.type! as UnitOfMeasureType,
        isDefault: Boolean(payload.isDefault),
        isActive: payload.isActive ?? true,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )

    return { status: 'applied' }
  }

  private async applyProductOperation(businessId: string, operation: SyncOperation): Promise<BatchProcessingResult> {
    const existing = await this.productsRepo.findOne({
      where: { id: operation.recordId, businessId },
      withDeleted: true,
    })

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)) {
      if (existing) {
        await this.productsRepo.update(operation.recordId, {
          isActive: false,
          deletedAt: operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        })
      }

      return { status: 'applied' }
    }

    const payload = this.readProductPayload(operation.payload)
    const unitOfMeasure = await this.resolveProductUnitOfMeasure(payload.unitOfMeasureId, businessId)
    const dto = plainToInstance(CreateProductDto, {
      name: payload.name,
      description: payload.description ?? undefined,
      sku: payload.sku ?? undefined,
      barcode: payload.barcode ?? undefined,
      sellingPrice: payload.sellingPrice,
      costPrice: payload.costPrice ?? undefined,
      taxRate: payload.taxRate ?? undefined,
      openingStock: payload.openingStock ?? payload.currentStock ?? undefined,
      lowStockThreshold: payload.lowStockThreshold ?? undefined,
      unitOfMeasureId: unitOfMeasure.id,
      categoryId: payload.categoryId ?? undefined,
      imageUrl: payload.imageUrl ?? undefined,
      productType: payload.productType ?? undefined,
      isService: payload.isService ?? undefined,
      trackInventory: payload.trackInventory ?? undefined,
      isActive: payload.isActive ?? undefined,
    })
    await this.ensureValidDto(dto)

    const [business, category] = await Promise.all([
      this.findBusiness(businessId),
      payload.categoryId ? this.findCategory(payload.categoryId, businessId) : Promise.resolve(null),
    ])

    const slug = await this.slugService.generateProductSlug(payload.name!, businessId, existing?.id)
    const sku = await this.resolveProductSku(businessId, category?.slug ?? null, payload, existing?.id, existing?.sku ?? null)
    const barcode = await this.resolveProductBarcode(businessId, payload, existing, sku)
    // productType is authoritative; isService/trackInventory are derived from it.
    // Fall back to the payload's/existing productType, then to a classification
    // inferred from the legacy isService flag (older clients send no productType).
    const productType =
      payload.productType ??
      existing?.productType ??
      inferProductType(payload.isService ?? existing?.isService)
    const { isService, trackInventory } = deriveProductTypeFlags(
      productType,
      payload.trackInventory ?? existing?.trackInventory,
    )

    if (existing) {
      const nextIsActive = payload.isActive ?? existing.isActive
      const reactivatesQuotaConsumer =
        nextIsActive && (existing.deletedAt !== null || existing.isActive === false)

      // Product creation is quota-limited in both the controller path and the
      // sync path. Without this check, an offline device could create beyond
      // plan limits and only discover the problem after the data was already
      // accepted server-side.
      if (reactivatesQuotaConsumer) {
        await this.quotaService.assertWithinQuota(businessId, 'products')
      }

      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Product).update(operation.recordId, {
          categoryId: category?.id ?? null,
          brandId: this.normalizeOptionalString(payload.brandId),
          modelId: this.normalizeOptionalString(payload.modelId),
          unitOfMeasureId: unitOfMeasure.id,
          name: payload.name!.trim(),
          slug,
          description: this.normalizeOptionalString(payload.description),
          barcode: barcode.value,
          barcodeType: barcode.type,
          isBarcodeGenerated: barcode.isGenerated,
          sellingPrice: payload.sellingPrice!,
          costPrice: payload.costPrice ?? null,
          taxRate: payload.taxRate ?? existing.taxRate ?? 0,
          isActive: nextIsActive,
          productType,
          isService,
          trackInventory,
          isFeatured: payload.isFeatured ?? existing.isFeatured,
          isPublishedOnline: payload.isPublishedOnline ?? existing.isPublishedOnline,
          onlineDescription: this.normalizeOptionalString(payload.onlineDescription),
          onlineStockReserve: payload.onlineStockReserve ?? existing.onlineStockReserve,
          metaTitle: this.normalizeOptionalString(payload.metaTitle),
          metaDescription: this.normalizeOptionalString(payload.metaDescription),
          isSerialized: payload.isSerialized ?? existing.isSerialized,
          serialType: this.normalizeOptionalString(payload.serialType),
          warrantyMonths: payload.warrantyMonths ?? existing.warrantyMonths ?? null,
          imageUrl: this.normalizeOptionalString(payload.imageUrl),
          deletedAt: null,
          updatedAt: operation.recordUpdatedAt,
        })

        const inventoryRepo = manager.getRepository(InventoryLevel)
        const inventoryLevel = await inventoryRepo.findOne({
          where: { businessId, productId: operation.recordId },
        })

        if (trackInventory && !inventoryLevel) {
          await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: operation.recordId,
              quantity: 0,
              lowStockThreshold: payload.lowStockThreshold ?? null,
            }),
          )
        } else if (trackInventory && inventoryLevel) {
          await inventoryRepo.update(inventoryLevel.id, {
            lowStockThreshold:
              payload.lowStockThreshold === undefined
                ? inventoryLevel.lowStockThreshold
                : payload.lowStockThreshold,
          })
        } else if (!trackInventory && inventoryLevel) {
          await inventoryRepo.delete({ id: inventoryLevel.id })
        }
      })

      return { status: 'applied' }
    }

    const openingStock = trackInventory
      ? Math.max(payload.currentStock ?? payload.openingStock ?? 0, 0)
      : 0

    if (payload.isActive ?? true) {
      await this.quotaService.assertWithinQuota(businessId, 'products')
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Product).save(
        manager.getRepository(Product).create({
          id: operation.recordId,
          businessId,
          categoryId: category?.id ?? null,
          brandId: this.normalizeOptionalString(payload.brandId),
          modelId: this.normalizeOptionalString(payload.modelId),
          unitOfMeasureId: unitOfMeasure.id,
          name: payload.name!.trim(),
          slug,
          description: this.normalizeOptionalString(payload.description),
          sku,
          barcode: barcode.value,
          barcodeType: barcode.type,
          isBarcodeGenerated: barcode.isGenerated,
          sellingPrice: payload.sellingPrice!,
          costPrice: payload.costPrice ?? null,
          currency: business.currency,
          taxRate: payload.taxRate ?? 0,
          isActive: payload.isActive ?? true,
          productType,
          isService,
          trackInventory,
          isFeatured: payload.isFeatured ?? false,
          isPublishedOnline: payload.isPublishedOnline ?? false,
          onlineDescription: this.normalizeOptionalString(payload.onlineDescription),
          onlineStockReserve: payload.onlineStockReserve ?? 0,
          metaTitle: this.normalizeOptionalString(payload.metaTitle),
          metaDescription: this.normalizeOptionalString(payload.metaDescription),
          isSerialized: payload.isSerialized ?? false,
          serialType: this.normalizeOptionalString(payload.serialType),
          warrantyMonths: payload.warrantyMonths ?? null,
          imageUrl: this.normalizeOptionalString(payload.imageUrl),
          createdById: payload.createdById ?? null,
          createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
        }),
      )

      if (trackInventory) {
        await manager.getRepository(InventoryLevel).save(
          manager.getRepository(InventoryLevel).create({
            businessId,
            productId: operation.recordId,
            quantity: openingStock,
            lowStockThreshold: payload.lowStockThreshold ?? null,
          }),
        )

        if (openingStock > 0) {
          await manager.getRepository(InventoryMovement).save(
            manager.getRepository(InventoryMovement).create({
              id: operation.recordId,
              businessId,
              productId: operation.recordId,
              type: MovementType.OPENING_STOCK,
              quantityChange: openingStock,
              quantityBefore: 0,
              quantityAfter: openingStock,
              referenceType: 'product',
              referenceId: operation.recordId,
              notes: 'Opening stock set during sync',
              performedById: payload.createdById ?? null,
            }),
          )
        }
      }
    })

    return { status: 'applied' }
  }

  private async applyInventoryThresholdOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const payload = this.readInventoryThresholdPayload(operation.payload)
    const product = await this.productsRepo.findOne({
      where: { id: payload.productId, businessId, deletedAt: IsNull() },
    })

    if (!product || !product.trackInventory) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.inventory_not_found'),
        'INVENTORY_NOT_FOUND',
      )
    }

    const existingLevel = await this.inventoryLevelsRepo.findOne({
      where: { businessId, productId: payload.productId },
    })

    if (existingLevel && operation.recordUpdatedAt <= existingLevel.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    if (existingLevel) {
      await this.inventoryLevelsRepo.update(existingLevel.id, {
        lowStockThreshold: payload.lowStockThreshold ?? null,
        reorderPoint: payload.reorderPoint ?? null,
        updatedAt: operation.recordUpdatedAt,
      })
      return { status: 'applied' }
    }

    await this.inventoryLevelsRepo.save(
      this.inventoryLevelsRepo.create({
        businessId,
        productId: payload.productId,
        quantity: 0,
        lowStockThreshold: payload.lowStockThreshold ?? null,
        reorderPoint: payload.reorderPoint ?? null,
        createdAt: operation.recordUpdatedAt,
        updatedAt: operation.recordUpdatedAt,
      }),
    )

    return { status: 'applied' }
  }

  private async applyInventoryAdjustmentOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const payload = this.readInventoryAdjustmentPayload(operation.payload)
    const product = await this.productsRepo.findOne({
      where: { id: payload.productId, businessId, deletedAt: IsNull() },
    })

    if (!product || !product.trackInventory) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.inventory_not_found'),
        'INVENTORY_NOT_FOUND',
      )
    }

    const existingMovement = await this.inventoryMovementsRepo.findOne({
      where: { id: operation.recordId, businessId },
    })

    if (existingMovement) {
      return { status: 'applied' }
    }

    return this.dataSource.transaction(async (manager) => {
      const inventoryRepo = manager.getRepository(InventoryLevel)
      const movementRepo = manager.getRepository(InventoryMovement)

      const level =
        (await inventoryRepo.findOne({
          where: { businessId, productId: payload.productId },
        })) ??
        (await inventoryRepo.save(
          inventoryRepo.create({
            businessId,
            productId: payload.productId,
            quantity: 0,
            createdAt: operation.recordUpdatedAt,
            updatedAt: operation.recordUpdatedAt,
          }),
        ))

      const quantityBefore = Number(level.quantity)
      const quantityAfter = this.calculateAdjustmentQuantity(quantityBefore, payload)

      if (quantityAfter < 0) {
        return {
          status: 'conflict',
          resolution: 'server_wins',
          errorMessage: 'Inventory quantity changed on another device. Unable to apply this adjustment.',
        }
      }

      await inventoryRepo.update(level.id, {
        quantity: quantityAfter,
        updatedAt: operation.recordUpdatedAt,
      })

      await movementRepo.save(
        movementRepo.create({
          id: operation.recordId,
          businessId,
          productId: payload.productId,
          type: MovementType.MANUAL_ADJUSTMENT,
          quantityChange: quantityAfter - quantityBefore,
          quantityBefore,
          quantityAfter,
          referenceType: 'adjustment',
          referenceId: payload.productId,
          notes: payload.notes.trim(),
          performedById: null,
          createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
        }),
      )

      return { status: 'applied' }
    })
  }

  private async applyInventoryRestockOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const payload = this.readInventoryRestockPayload(operation.payload)
    await this.inventoryService.restockFromSync(
      businessId,
      operation.recordId,
      payload,
      operation.recordUpdatedAt,
    )
    return { status: 'applied' }
  }

  private async applySaleOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    if (operation.action === 'DELETE') {
      return {
        status: 'failed',
        errorMessage: 'Deleting synced sales is not supported.',
      }
    }

    const payload = this.readSalePayload(operation.payload)
    await this.salesService.createFromSync(businessId, payload)
    return { status: 'applied' }
  }

  private async applyDebtOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    if (operation.action === 'DELETE') {
      return {
        status: 'failed',
        errorMessage: 'Deleting synced debts is not supported.',
      }
    }

    const payload = this.readDebtPayload(operation.payload)
    const contact = await this.contactsRepo.findOne({
      where: {
        id: payload.contactId,
        businessId,
      },
      select: ['id', 'businessId'],
    })

    if (!contact) {
      return {
        status: 'failed',
        errorMessage: 'Debt contact could not be resolved.',
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const debtsRepo = manager.getRepository(Debt)
      const paymentsRepo = manager.getRepository(DebtPayment)
      const fallbackUserId = await this.resolveContactCreatedById(businessId, null)
      const existing = await debtsRepo.findOne({
        where: {
          businessId,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          direction: payload.direction,
        },
        relations: {
          payments: true,
        },
      })

      if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
        return {
          status: 'conflict' as const,
          resolution: 'server_wins' as const,
        }
      }

      const totalPaid = this.normalizeMoney(
        (payload.payments ?? []).reduce((sum, payment) => sum + this.normalizeMoney(payment.amount), 0),
      )
      const normalizedOriginalAmount = this.normalizeMoney(payload.originalAmount)
      const isWrittenOff = payload.status === DebtStatus.WRITTEN_OFF || Boolean(payload.writtenOffAt)
      const status = isWrittenOff
        ? DebtStatus.WRITTEN_OFF
        : totalPaid >= normalizedOriginalAmount
          ? DebtStatus.SETTLED
          : totalPaid > 0
            ? DebtStatus.PARTIALLY_PAID
            : DebtStatus.OUTSTANDING
      const settledAt =
        status === DebtStatus.SETTLED
          ? this.parseOptionalDate(payload.settledAt) ?? operation.recordUpdatedAt
          : null
      const writtenOffAt =
        status === DebtStatus.WRITTEN_OFF
          ? this.parseOptionalDate(payload.writtenOffAt) ?? operation.recordUpdatedAt
          : null
      const writtenOffById =
        status === DebtStatus.WRITTEN_OFF
          ? this.normalizeOptionalString(payload.writtenOffById) ?? fallbackUserId
          : null
      const writtenOffReason =
        status === DebtStatus.WRITTEN_OFF
          ? this.normalizeOptionalString(payload.writtenOffReason)
          : null

      const debt = await debtsRepo.save(
        debtsRepo.create({
          id: existing?.id,
          businessId,
          contactId: payload.contactId,
          direction: payload.direction,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          sourceReference: this.normalizeOptionalString(payload.sourceReference) ?? payload.sourceId,
          originalAmount: normalizedOriginalAmount,
          status,
          dueDate: payload.dueDate ?? null,
          notes: this.normalizeOptionalString(payload.notes),
          createdAt: this.parseOptionalDate(payload.createdAt) ?? operation.recordUpdatedAt,
          updatedAt: operation.recordUpdatedAt,
          settledAt,
          writtenOffAt,
          writtenOffById,
          writtenOffReason,
        }),
      )

      const existingPayments = existing?.payments ?? []
      const nextPaymentIds = new Set((payload.payments ?? []).map((payment) => payment.id))
      const stalePaymentIds = existingPayments
        .filter((payment) => !nextPaymentIds.has(payment.id))
        .map((payment) => payment.id)

      if (stalePaymentIds.length > 0) {
        await paymentsRepo.delete(stalePaymentIds)
      }

      for (const payment of payload.payments ?? []) {
        await paymentsRepo.save(
          paymentsRepo.create({
            id: payment.id,
            businessId,
            debtId: debt.id,
            amount: this.normalizeMoney(payment.amount),
            method: payment.method,
            mobileMoneyReference: this.normalizeOptionalString(payment.mobileMoneyReference),
            paymentDate: payment.paymentDate,
            notes: this.normalizeOptionalString(payment.notes),
            recordedById: this.normalizeOptionalString(payment.recordedById) ?? fallbackUserId,
            createdAt: this.parseOptionalDate(payment.createdAt) ?? operation.recordUpdatedAt,
          }),
        )
      }

      return { status: 'applied' as const }
    })
  }

  private async applyExpenseOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    const existing = await this.expensesRepo.findOne({
      where: { id: operation.recordId },
      withDeleted: true,
    })

    if (existing?.businessId && existing.businessId !== businessId) {
      return {
        status: 'failed',
        errorMessage: 'Expense belongs to another business.',
      }
    }

    if (existing && operation.recordUpdatedAt <= existing.updatedAt) {
      return {
        status: 'conflict',
        resolution: 'server_wins',
      }
    }

    const payload =
      operation.action === 'DELETE' || Boolean(operation.payload?.isDeleted)
        ? ((operation.payload ?? {}) as unknown as ExpenseSyncPayload)
        : this.readExpensePayload(operation.payload)

    await this.expensesService.upsertFromSync(
      businessId,
      operation.recordId,
      payload,
      operation.action as 'UPSERT' | 'DELETE',
      operation.recordUpdatedAt,
    )

    return { status: 'applied' }
  }

  private async applySavingsAccountOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    if (operation.action === 'DELETE') {
      return {
        status: 'failed',
        errorMessage: 'Deleting synced savings accounts is not supported.',
      }
    }

    const payload = this.readSavingsAccountPayload(operation.payload)
    await this.savingsService.applySavingsAccountOperation(businessId, payload)
    return { status: 'applied' }
  }

  private async applySavingsTransactionOperation(
    businessId: string,
    operation: SyncOperation,
  ): Promise<BatchProcessingResult> {
    if (operation.action === 'DELETE') {
      return {
        status: 'failed',
        errorMessage: 'Deleting synced savings transactions is not supported.',
      }
    }

    const payload = this.readSavingsTransactionPayload(operation.payload)
    await this.savingsService.applyTransactionOperation(businessId, payload)
    return { status: 'applied' }
  }

  private readSavingsAccountPayload(payload: Record<string, unknown> | null): SavingsAccountSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Savings account sync payload is required.',
        'SYNC_SAVINGS_ACCOUNT_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as SavingsAccountSyncPayload
  }

  private readSavingsTransactionPayload(payload: Record<string, unknown> | null): SavingsTransactionSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Savings transaction sync payload is required.',
        'SYNC_SAVINGS_TRANSACTION_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as SavingsTransactionSyncPayload
  }

  private async resolveProductSku(
    businessId: string,
    categorySlug: string | null,
    payload: ProductSyncPayload,
    productId?: string,
    existingSku?: string | null,
  ) {
    if (existingSku) {
      const incomingSku = payload.sku?.trim().toUpperCase()
      if (incomingSku && incomingSku !== existingSku) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.product_sku_immutable'),
          'PRODUCT_SKU_IMMUTABLE',
        )
      }

      return existingSku
    }

    if (payload.sku) {
      return this.skuService.validateAndNormalize(businessId, payload.sku, productId)
    }

    return this.skuService.generate(businessId, categorySlug ?? undefined)
  }

  private async resolveProductBarcode(
    businessId: string,
    payload: ProductSyncPayload,
    existing: Product | null,
    sku: string,
  ) {
    if (payload.barcode) {
      return this.barcodeService.validateAndNormalize(businessId, payload.barcode, existing?.id)
    }

    if (existing?.barcode) {
      return {
        value: existing.barcode,
        type: existing.barcodeType,
        isGenerated: existing.isBarcodeGenerated,
      }
    }

    return this.barcodeService.generateFromSKU(sku)
  }

  private async findBusiness(businessId: string) {
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })

    if (!business) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.business_not_found'),
        'BUSINESS_NOT_FOUND',
      )
    }

    return business
  }

  private async findCategory(categoryId: string, businessId: string) {
    const category = await this.categoriesRepo.findOne({
      where: { id: categoryId, businessId, deletedAt: IsNull() },
    })

    if (!category) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.category_not_found'),
        'CATEGORY_NOT_FOUND',
      )
    }

    return category
  }

  private async findUnitOfMeasure(unitOfMeasureId: string, businessId: string) {
    const unit = await this.unitsRepo.findOne({
      where: [
        { id: unitOfMeasureId, businessId: IsNull() },
        { id: unitOfMeasureId, businessId },
      ],
    })

    if (!unit) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.unit_of_measure_not_found'),
        'UNIT_OF_MEASURE_NOT_FOUND',
      )
    }

    return unit
  }

  private async resolveProductUnitOfMeasure(unitOfMeasureId: string | null | undefined, businessId: string) {
    const normalizedId = this.normalizeOptionalString(unitOfMeasureId)

    if (!normalizedId) {
      throw new AppBadRequestException(
        'unitOfMeasureId is required',
        'SYNC_PAYLOAD_INVALID',
      )
    }

    if (UUID_REGEX.test(normalizedId)) {
      return await this.findUnitOfMeasure(normalizedId, businessId)
    }

    const alias = DEFAULT_UNIT_ALIASES[normalizedId.toLowerCase()]

    if (alias) {
      const normalizedAliasName = this.normalizeUnitNameCandidate(alias.name)
      const normalizedAliasAbbreviation = alias.abbreviation.trim().toLowerCase()
      const candidates = await this.unitsRepo.find({
        where: {
          businessId: IsNull(),
          type: alias.type,
          deletedAt: IsNull(),
        },
      })

      const unit = candidates.find((candidate) => {
        const candidateName = this.normalizeUnitNameCandidate(candidate.name)
        const candidateAbbreviation = candidate.abbreviation.trim().toLowerCase()

        return (
          candidateName === normalizedAliasName ||
          candidateAbbreviation === normalizedAliasAbbreviation
        )
      })

      if (unit) {
        return unit
      }

      return await this.unitsRepo.save(
        this.unitsRepo.create({
          businessId: null,
          name: alias.name,
          abbreviation: alias.abbreviation,
          type: alias.type,
          isDefault: true,
          isActive: true,
        }),
      )
    }

    const canonicalName = this.normalizeUnitNameCandidate(normalizedId)
    const normalizedAbbreviation = normalizedId.toLowerCase()

    const candidates = await this.unitsRepo.find({
      where: [
        { businessId: IsNull(), deletedAt: IsNull() },
        { businessId, deletedAt: IsNull() },
      ],
    })

    const match = candidates.find((candidate) => {
      const candidateName = candidate.name.trim().toLowerCase()
      const candidateAbbreviation = candidate.abbreviation.trim().toLowerCase()

      return candidateName === canonicalName || candidateAbbreviation === normalizedAbbreviation
    })

    if (match) {
      return match
    }

    throw new AppBadRequestException(
      'unitOfMeasureId must reference a known unit of measure',
      'SYNC_PAYLOAD_INVALID',
    )
  }

  private async findBatchWithOperations(batchId: string, businessId?: string, deviceId?: string) {
    const where = businessId
      ? {
          id: batchId,
          businessId,
          ...(deviceId ? { deviceId } : {}),
        }
      : { id: batchId }
    return this.syncBatchesRepo.findOne({
      where,
      relations: ['operations'],
    })
  }

  private async enqueuePersistedBatch(batchId: string) {
    const batch = await this.findBatchWithOperations(batchId)
    if (!batch || TERMINAL_BATCH_STATUSES.has(batch.status as SyncBatchStatus)) {
      return batch
    }

    try {
      const jobId = this.buildQueueJobId(batch.id)
      const job = await this.queue.add(
        SYNC_PROCESS_BATCH_JOB,
        { batchId: batch.id },
        { jobId },
      )

      await this.syncBatchesRepo.update(batch.id, {
        status: 'queued',
        bullJobId: String(job.id),
        completedAt: null,
        lastError: null,
      })

      const queuedBatch = await this.findBatchWithOperations(batch.id)
      if (queuedBatch) {
        this.logger.log('Queued sync batch job', 'SyncService', {
          queue: SYNC_BATCHES_QUEUE,
          batchId: queuedBatch.id,
          bullJobId: queuedBatch.bullJobId,
          acceptedCount: queuedBatch.acceptedCount,
          deviceId: queuedBatch.deviceId,
        })

        await this.emitBatchStatus(queuedBatch.id)
      }

      return queuedBatch
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync batch could not be queued.'

      await this.syncBatchesRepo.update(batch.id, {
        status: 'enqueue_failed',
        completedAt: new Date(),
        lastError: message,
      })

      const failedBatch = await this.findBatchWithOperations(batch.id)
      if (failedBatch) {
        await this.emitBatchStatus(failedBatch.id)
      }

      return failedBatch
    }
  }

  private async reconcileBatchState(batch: SyncBatch) {
    if (TERMINAL_BATCH_STATUSES.has(batch.status as SyncBatchStatus)) {
      return batch
    }

    if (batch.status === 'pending_enqueue') {
      const queuedBatch = await this.enqueuePersistedBatch(batch.id)
      return queuedBatch ?? batch
    }

    const job = await this.findQueueJob(batch)
    if (!job) {
      if (batch.status === 'queued') {
        const requeuedBatch = await this.enqueuePersistedBatch(batch.id)
        return requeuedBatch ?? batch
      }

      await this.markPendingOperationsFailed(batch.id, 'Sync batch job could not be found.')
      const finalizedBatch = await this.finalizeBatchFromPersistedOperations(
        batch.id,
        'Sync batch job could not be found.',
      )
      return finalizedBatch ?? batch
    }

    const jobState = await job.getState()

    if (jobState === 'active' && batch.status !== 'processing') {
      await this.syncBatchesRepo.update(batch.id, {
        status: 'processing',
        startedAt: batch.startedAt ?? new Date(),
        lastError: null,
      })

      const processingBatch = await this.findBatchWithOperations(batch.id)
      return processingBatch ?? batch
    }

    if (jobState === 'waiting' || jobState === 'delayed' || jobState === 'prioritized') {
      if (batch.status !== 'queued') {
        await this.syncBatchesRepo.update(batch.id, {
          status: 'queued',
          bullJobId: String(job.id),
          lastError: null,
        })
      }

      const queuedBatch = await this.findBatchWithOperations(batch.id)
      return queuedBatch ?? batch
    }

    if (jobState === 'completed') {
      const pendingMessage = 'Sync batch finished without marking every operation.'
      await this.markPendingOperationsFailed(batch.id, pendingMessage)
      const finalizedBatch = await this.finalizeBatchFromPersistedOperations(batch.id)
      if (finalizedBatch && !TERMINAL_BATCH_STATUSES.has(finalizedBatch.status as SyncBatchStatus)) {
        await this.syncBatchesRepo.update(batch.id, {
          status: 'failed',
          completedAt: new Date(),
          lastError: pendingMessage,
        })
      }

      const reconciledBatch = await this.findBatchWithOperations(batch.id)
      if (reconciledBatch) {
        await this.emitBatchStatus(reconciledBatch.id)
        return reconciledBatch
      }
    }

    if (jobState === 'failed') {
      const failedReason =
        job.failedReason?.trim() || batch.lastError || 'Sync batch failed while processing.'

      await this.markPendingOperationsFailed(batch.id, failedReason)
      const finalizedBatch = await this.finalizeBatchFromPersistedOperations(batch.id, failedReason)
      if (finalizedBatch) {
        await this.emitBatchStatus(finalizedBatch.id)
        return finalizedBatch
      }
    }

    return (await this.findBatchWithOperations(batch.id)) ?? batch
  }

  private buildQueueJobId(batchId: string) {
    return `${SYNC_PROCESS_BATCH_JOB}-${batchId}`
  }

  private async findQueueJob(batch: Pick<SyncBatch, 'id' | 'bullJobId'>) {
    const jobId = batch.bullJobId ?? this.buildQueueJobId(batch.id)
    return this.queue.getJob(jobId)
  }

  private async markPendingOperationsFailed(batchId: string, errorMessage: string) {
    await this.syncOperationsRepo
      .createQueryBuilder()
      .update(SyncOperation)
      .set({
        status: 'failed',
        errorMessage,
        errorDetails: null,
      })
      .where('batch_id = :batchId', { batchId })
      .andWhere('status = :status', { status: 'pending' })
      .execute()
  }

  private async finalizeBatchFromPersistedOperations(batchId: string, lastError?: string | null) {
    const batch = await this.findBatchWithOperations(batchId)
    if (!batch) {
      return null
    }

    const counts = this.countBatchResults(batch.operations ?? [])
    const status = this.resolveBatchStatus(
      counts.processedCount,
      counts.appliedCount,
      counts.failedCount,
    )

    await this.syncBatchesRepo.update(batch.id, {
      status,
      processedCount: counts.processedCount,
      appliedCount: counts.appliedCount,
      conflictCount: counts.conflictCount,
      failedCount: counts.failedCount,
      completedAt: new Date(),
      lastError: lastError ?? this.resolveFirstBatchError(batch.operations ?? []) ?? null,
    })

    return this.findBatchWithOperations(batch.id)
  }

  private countBatchResults(operations: SyncOperation[]) {
    let processedCount = 0
    let appliedCount = 0
    let conflictCount = 0
    let failedCount = 0

    for (const operation of operations) {
      if (operation.status === 'pending') {
        continue
      }

      processedCount += 1

      if (operation.status === 'applied') {
        appliedCount += 1
      } else if (operation.status === 'conflict') {
        conflictCount += 1
      } else if (operation.status === 'failed') {
        failedCount += 1
      }
    }

    return {
      processedCount,
      appliedCount,
      conflictCount,
      failedCount,
    }
  }

  private resolveFirstBatchError(operations: SyncOperation[]) {
    return operations.find((operation) => operation.status === 'failed' && operation.errorMessage)
      ?.errorMessage ?? null
  }

  private async emitBatchStatus(batchId: string) {
    const batch = await this.findBatchWithOperations(batchId)
    if (!batch) {
      this.logger.warn('Batch not found or already in terminal status, skipping processing', 'SyncService', { batchId })
      return
    }

    this.realtime.emitBatchStatus(
      batch.businessId,
      batch.deviceId,
      this.toBatchStatusResponse(batch),
    )
  }

  private toBatchStatusResponse(batch: SyncBatch): SyncBatchStatusResponse {
    return {
      batchId: batch.id,
      status: batch.status as SyncBatchStatus,
      acceptedCount: batch.acceptedCount,
      processedCount: batch.processedCount,
      appliedCount: batch.appliedCount,
      conflictCount: batch.conflictCount,
      failedCount: batch.failedCount,
      queuedAt: batch.createdAt.toISOString(),
      startedAt: batch.startedAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      lastError: batch.lastError ?? null,
      results: [...(batch.operations ?? [])]
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((operation) => this.toOperationResult(operation)),
    }
  }

  private toOperationResult(operation: SyncOperation): SyncOperationResult {
    return {
      operationId: operation.clientOperationId,
      entity: operation.entity as SyncOperationResult['entity'],
      recordId: operation.recordId,
      status: operation.status as SyncOperationResult['status'],
      resolution:
        operation.resolution === 'server_wins' || operation.resolution === 'client_wins'
          ? operation.resolution
          : null,
      errorMessage: operation.errorMessage ?? null,
      errorDetails: (operation.errorDetails as SyncOperationFailureDetails | null | undefined) ?? null,
    }
  }

  private toProductSyncRecord(record: Product): SyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      name: record.name,
      slug: record.slug,
      description: record.description ?? null,
      sku: record.sku,
      barcode: record.barcode,
      barcodeType: record.barcodeType ?? null,
      isBarcodeGenerated: record.isBarcodeGenerated,
      sellingPrice: record.sellingPrice,
      costPrice: record.costPrice ?? null,
      currency: record.currency,
      taxRate: record.taxRate,
      isService: record.isService,
      trackInventory: record.trackInventory,
      hasVariants: record.hasVariants,
      productType: record.productType,
      isSerialized: record.isSerialized,
      serialType: record.serialType ?? null,
      warrantyMonths: record.warrantyMonths ?? null,
      categoryId: record.categoryId ?? null,
      brandId: record.brandId ?? null,
      modelId: record.modelId ?? null,
      isFeatured: record.isFeatured,
      isPublishedOnline: record.isPublishedOnline,
      onlineDescription: record.onlineDescription ?? null,
      onlineStockReserve: record.onlineStockReserve,
      metaTitle: record.metaTitle ?? null,
      metaDescription: record.metaDescription ?? null,
      unitOfMeasureId: record.unitOfMeasureId,
      imageUrl: record.imageUrl ?? null,
      createdById: record.createdById ?? null,
      isActive: record.isActive,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toContactSyncRecord(record: Contact): ContactSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      type: record.type as ContactType,
      name: record.name,
      phone: record.phone ?? null,
      phoneAlt: record.phoneAlt ?? null,
      address: record.address ?? null,
      notes: record.notes ?? null,
      isActive: record.isActive,
      createdById: record.createdById ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      isDeleted: false,
    }
  }

  private toOpeningBalanceSyncRecord(record: ContactOpeningBalance): OpeningBalanceSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      contactId: record.contactId,
      direction: record.direction as DebtDirection,
      amount: record.amount,
      asOfDate: record.asOfDate,
      notes: record.notes ?? null,
      recordedById: record.recordedById ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      isDeleted: false,
    }
  }

  private readOpeningBalancePayload(payload: Record<string, unknown> | null): OpeningBalanceSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Opening balance sync payload is missing or invalid.',
        'SYNC_PAYLOAD_INVALID',
      )
    }
    return payload as unknown as OpeningBalanceSyncPayload
  }

  private toCategorySyncRecord(record: ProductCategory): SyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      name: record.name,
      slug: record.slug,
      description: record.description ?? null,
      isActive: record.isActive,
      showOnline: record.showOnline,
      color: record.color ?? null,
      icon: record.icon ?? null,
      imageUrl: record.imageUrl ?? null,
      sortOrder: record.sortOrder,
      parentId: record.parentId ?? null,
      depth: record.depth,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toUnitSyncRecord(record: UnitOfMeasure): SyncRecord {
    return {
      id: record.id,
      name: record.name,
      abbreviation: record.abbreviation,
      businessId: record.businessId ?? null,
      type: record.type,
      isDefault: record.isDefault,
      isActive: record.isActive,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toExpenseCategorySyncRecord(record: ExpenseCategory): ExpenseCategorySyncRecord {
    return {
      id: record.id,
      businessId: record.businessId ?? null,
      name: record.name,
      slug: record.slug,
      color: record.color,
      icon: record.icon ?? null,
      sortOrder: record.sortOrder,
      isSystem: !record.businessId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toInventoryLevelSyncRecord(record: InventoryLevel): InventoryLevelSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      productId: record.productId,
      variantId: record.variantId ?? null,
      quantity: record.quantity,
      lowStockThreshold: record.lowStockThreshold ?? null,
      reorderPoint: record.reorderPoint ?? null,
      lastRestockAt: record.lastRestockAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toInventoryMovementSyncRecord(record: InventoryMovement): InventoryMovementSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      productId: record.productId,
      type: record.type as unknown as InventoryMovementSyncRecord['type'],
      quantityChange: record.quantityChange,
      quantityBefore: record.quantityBefore,
      quantityAfter: record.quantityAfter,
      referenceType: record.referenceType ?? null,
      referenceId: record.referenceId ?? null,
      notes: record.notes ?? null,
      performedById: record.performedById ?? null,
      performedByName: record.performedBy?.name ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toRestockRecordSyncRecord(record: RestockRecord): RestockRecordSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      referenceNumber: record.referenceNumber ?? null,
      supplierId: record.supplierId ?? null,
      supplierName: record.supplierName ?? null,
      totalAmount: record.totalAmount,
      amountPaid: record.amountPaid,
      creditAmount: record.creditAmount,
      totalCost: record.totalCost ?? null,
      notes: record.notes ?? null,
      performedById: record.performedById ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toRestockItemSyncRecord(
    record: RestockItem,
    newQuantity: number | null,
  ): RestockItemSyncRecord {
    return {
      id: record.id,
      restockRecordId: record.restockRecordId,
      productId: record.productId,
      quantity: record.quantity,
      unitCost: record.unitCost ?? null,
      newQuantity,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toSaleSyncRecord(record: Sale): SaleSyncRecord {
    const paymentMethods = [...new Set((record.payments ?? []).map((payment) => payment.method))]
    const paymentMethod =
      paymentMethods.length > 1
        ? PaymentMethod.MIXED
        : (paymentMethods[0] ?? (record.paymentMethod as PaymentMethod | null))

    return {
      id: record.id,
      businessId: record.businessId,
      clientId: record.clientId,
      cashierId: record.cashierId,
      cashierName: record.cashier?.name ?? null,
      saleNumber: record.saleNumber,
      status: record.status,
      subtotal: record.subtotal,
      discountAmount: record.discountAmount,
      chargesAmount: record.chargesAmount,
      taxAmount: record.taxAmount,
      totalAmount: record.totalAmount,
      amountPaid: record.amountPaid,
      creditAmount: record.creditAmount,
      changeGiven: record.changeGiven,
      customerId: record.customerId ?? null,
      customerName: record.customerName ?? null,
      customerPhone: record.customerPhone ?? null,
      notes: record.notes ?? null,
      priceDriftWarning: record.priceDriftWarning,
      saleDate: record.saleDate,
      soldAt: record.soldAt.toISOString(),
      syncedAt: record.syncedAt?.toISOString() ?? null,
      voidedAt: record.voidedAt?.toISOString() ?? null,
      voidedById: record.voidedById ?? null,
      voidReason: record.voidReason ?? null,
      currency: 'XAF',
      paymentMethod,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toSaleItemSyncRecord(record: SaleItem): SaleItemSyncRecord {
    return {
      id: record.id,
      saleId: record.saleId,
      businessId: record.businessId,
      productId: record.productId,
      variantId: record.variantId ?? null,
      variantName: record.variantName ?? null,
      serialUnitId: record.serialUnitId ?? null,
      serialNumber: record.serialNumber ?? null,
      productName: record.productName,
      productSku: record.productSku ?? null,
      unitOfMeasure: record.unitOfMeasure ?? null,
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      discountAmount: record.discountAmount,
      lineTotal: record.lineTotal,
      costPrice: record.costPrice ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toSalePaymentSyncRecord(record: SalePayment): SalePaymentSyncRecord {
    return {
      id: record.id,
      saleId: record.saleId,
      businessId: record.businessId,
      method: record.method,
      amount: record.amount,
      mobileMoneyReference: record.mobileMoneyReference ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toDebtSyncRecord(record: Debt): DebtSyncRecord {
    const payments = [...(record.payments ?? [])].sort((left, right) => {
      const dateCompare = left.paymentDate.localeCompare(right.paymentDate)
      if (dateCompare !== 0) {
        return dateCompare
      }

      return left.createdAt.getTime() - right.createdAt.getTime()
    })

    return {
      id: this.buildDebtSyncRecordId(record.sourceType, record.sourceId),
      businessId: record.businessId,
      contactId: record.contactId,
      direction: record.direction,
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      sourceReference: record.sourceReference,
      originalAmount: record.originalAmount,
      status: record.status,
      dueDate: record.dueDate ?? null,
      notes: record.notes ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      settledAt: record.settledAt?.toISOString() ?? null,
      writtenOffAt: record.writtenOffAt?.toISOString() ?? null,
      writtenOffById: record.writtenOffById ?? null,
      writtenOffReason: record.writtenOffReason ?? null,
      payments: payments.map((payment) => this.toDebtPaymentSyncPayload(payment)),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toDebtPaymentSyncPayload(payment: DebtPayment): DebtPaymentSyncPayload {
    return {
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      mobileMoneyReference: payment.mobileMoneyReference ?? null,
      paymentDate: payment.paymentDate,
      notes: payment.notes ?? null,
      recordedById: payment.recordedById,
      createdAt: payment.createdAt.toISOString(),
    }
  }

  private toExpenseSyncRecord(record: Expense): ExpenseSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      categoryId: record.categoryId,
      recordedById: record.recordedById,
      description: record.description,
      amount: record.amount,
      currency: record.currency ?? null,
      expenseDate: record.date.toISOString().slice(0, 10),
      vendor: record.vendor ?? null,
      notes: record.notes ?? null,
      isRecurring: record.isRecurring,
      paymentMethod: record.paymentMethod ?? null,
      receiptUrl: record.receiptUrl ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: Boolean(record.deletedAt),
    }
  }

  private toTeamMemberSyncRecord(record: BusinessMember): TeamMemberSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      userId: record.userId,
      roleId: record.roleId ?? null,
      role: record.role,
      status: record.status,
      name: record.user?.name ?? null,
      email: record.user?.email ?? null,
      phone: record.user?.phone ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toRoleSyncRecord(record: Role): RoleSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      name: record.name,
      description: record.description ?? null,
      isSystem: record.isSystem,
      isOwnerRole: record.isOwnerRole,
      colour: record.colour ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: null,
      isDeleted: false,
    }
  }

  private toSavingsAccountSyncRecord(record: CustomerDeposit): SavingsAccountSyncRecord {
    return {
      id: record.id,
      businessId: record.businessId,
      customerId: record.customerId,
      accountNumber: record.accountNumber,
      customerName: record.customerName ?? null,
      customerPhone: record.customerPhone ?? null,
      balance: record.balance,
      totalDeposited: record.totalDeposited,
      totalRefunded: record.totalRefunded,
      totalUsed: record.totalUsed,
      taggedProducts: record.taggedProducts ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
      isDeleted: record.isDeleted,
    }
  }

  private toSavingsTransactionSyncRecord(record: DepositTransaction): SavingsTransactionSyncRecord {
    return {
      id: record.id,
      savingsId: record.savingsId,
      businessId: record.businessId,
      type: record.type as SavingsTransactionSyncRecord['type'],
      direction: record.direction as SavingsTransactionSyncRecord['direction'],
      amount: record.amount,
      method: record.method ?? null,
      mobileMoneyReference: record.mobileMoneyReference ?? null,
      saleId: record.saleId ?? null,
      notes: record.notes ?? null,
      recordedById: record.recordedById ?? null,
      occurredAt: record.occurredAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
      deletedAt: null,
      isDeleted: record.isDeleted,
    }
  }

  private resolveBatchStatus(
    processedCount: number,
    appliedCount: number,
    failedCount: number,
  ): SyncBatchStatus {
    if (processedCount === 0) {
      return 'queued'
    }

    if (appliedCount === processedCount) {
      return 'completed'
    }

    if (failedCount === processedCount) {
      return 'failed'
    }

    return 'partial'
  }

  private readCategoryPayload(payload: Record<string, unknown> | null): CategorySyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Category sync payload is required.', 'SYNC_CATEGORY_PAYLOAD_REQUIRED')
    }

    return payload as CategorySyncPayload
  }

  private readAttributeGroupPayload(payload: Record<string, unknown> | null): AttributeGroupPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Attribute group sync payload is required.',
        'SYNC_ATTRIBUTE_GROUP_PAYLOAD_REQUIRED',
      )
    }
    const typed = payload as AttributeGroupPayload
    if (!typed.name?.trim()) {
      throw new AppBadRequestException('Attribute group name is required.', 'SYNC_ATTRIBUTE_GROUP_NAME_REQUIRED')
    }
    return typed
  }

  private readAttributeOptionPayload(payload: Record<string, unknown> | null): AttributeOptionPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Attribute option sync payload is required.',
        'SYNC_ATTRIBUTE_OPTION_PAYLOAD_REQUIRED',
      )
    }
    const typed = payload as AttributeOptionPayload
    if (!typed.value?.trim()) {
      throw new AppBadRequestException('Attribute option value is required.', 'SYNC_ATTRIBUTE_OPTION_VALUE_REQUIRED')
    }
    return typed
  }

  private readCategoryAttributeGroupPayload(
    payload: Record<string, unknown> | null,
  ): CategoryAttributeGroupPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Category attribute link sync payload is required.',
        'SYNC_CATEGORY_ATTR_LINK_PAYLOAD_REQUIRED',
      )
    }
    return payload as CategoryAttributeGroupPayload
  }

  private readBrandPayload(payload: Record<string, unknown> | null): BrandPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Brand sync payload is required.', 'SYNC_BRAND_PAYLOAD_REQUIRED')
    }
    const typed = payload as BrandPayload
    if (!typed.name?.trim()) {
      throw new AppBadRequestException('Brand name is required.', 'SYNC_BRAND_NAME_REQUIRED')
    }
    return typed
  }

  private readModelPayload(payload: Record<string, unknown> | null): ModelPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Model sync payload is required.', 'SYNC_MODEL_PAYLOAD_REQUIRED')
    }
    const typed = payload as ModelPayload
    if (!typed.name?.trim()) {
      throw new AppBadRequestException('Model name is required.', 'SYNC_MODEL_NAME_REQUIRED')
    }
    return typed
  }

  private readBrandCategoryPayload(payload: Record<string, unknown> | null): BrandCategoryPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Brand-category link sync payload is required.',
        'SYNC_BRAND_CATEGORY_PAYLOAD_REQUIRED',
      )
    }
    return payload as BrandCategoryPayload
  }

  private readProductImagePayload(payload: Record<string, unknown> | null): ProductImagePayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Product image sync payload is required.', 'SYNC_PRODUCT_IMAGE_PAYLOAD_REQUIRED')
    }
    const typed = payload as ProductImagePayload
    if (!typed.url?.trim()) {
      throw new AppBadRequestException('Product image url is required.', 'SYNC_PRODUCT_IMAGE_URL_REQUIRED')
    }
    return typed
  }

  private readProductVariantPayload(payload: Record<string, unknown> | null): ProductVariantPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Product variant sync payload is required.', 'SYNC_VARIANT_PAYLOAD_REQUIRED')
    }
    const typed = payload as ProductVariantPayload
    if (!typed.name?.trim()) {
      throw new AppBadRequestException('Product variant name is required.', 'SYNC_VARIANT_NAME_REQUIRED')
    }
    return typed
  }

  private readProductVariantOptionPayload(payload: Record<string, unknown> | null): ProductVariantOptionPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Variant option sync payload is required.',
        'SYNC_VARIANT_OPTION_PAYLOAD_REQUIRED',
      )
    }
    return payload as ProductVariantOptionPayload
  }

  private readProductSerialUnitPayload(payload: Record<string, unknown> | null): ProductSerialUnitPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Serial unit sync payload is required.',
        'SYNC_SERIAL_UNIT_PAYLOAD_REQUIRED',
      )
    }
    return payload as ProductSerialUnitPayload
  }

  /** Fallback slug from a name (the client normally sends its own). */
  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 140)
  }

  /** Coerce a synced display type to a valid enum value (defends the DB CHECK constraint). */
  private normalizeDisplayType(value: string | null | undefined): AttributeDisplayType {
    const upper = (value ?? '').toUpperCase()
    if (
      upper === AttributeDisplayType.SWATCHES ||
      upper === AttributeDisplayType.DROPDOWN ||
      upper === AttributeDisplayType.CHIPS
    ) {
      return upper as AttributeDisplayType
    }
    return AttributeDisplayType.CHIPS
  }

  private readContactPayload(payload: Record<string, unknown> | null): ContactPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Contact sync payload is required.', 'SYNC_CONTACT_PAYLOAD_REQUIRED')
    }

    return payload as ContactPayload
  }

  private readUnitPayload(payload: Record<string, unknown> | null): UnitSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Unit of measure sync payload is required.',
        'SYNC_UNIT_OF_MEASURE_PAYLOAD_REQUIRED',
      )
    }

    return payload as UnitSyncPayload
  }

  private readProductPayload(payload: Record<string, unknown> | null): ProductSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException('Product sync payload is required.', 'SYNC_PRODUCT_PAYLOAD_REQUIRED')
    }

    return payload as ProductSyncPayload
  }

  private readInventoryThresholdPayload(
    payload: Record<string, unknown> | null,
  ): InventoryThresholdSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Inventory threshold sync payload is required.',
        'SYNC_INVENTORY_THRESHOLD_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as InventoryThresholdSyncPayload
  }

  private readInventoryAdjustmentPayload(
    payload: Record<string, unknown> | null,
  ): InventoryAdjustmentSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Inventory adjustment sync payload is required.',
        'SYNC_INVENTORY_ADJUSTMENT_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as InventoryAdjustmentSyncPayload
  }

  private readInventoryRestockPayload(
    payload: Record<string, unknown> | null,
  ): InventoryRestockSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Inventory restock sync payload is required.',
        'SYNC_INVENTORY_RESTOCK_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as InventoryRestockSyncPayload
  }

  private readSalePayload(payload: Record<string, unknown> | null): SaleSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Sale sync payload is required.',
        'SYNC_SALE_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as SaleSyncPayload
  }

  private readDebtPayload(payload: Record<string, unknown> | null): DebtSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Debt sync payload is required.',
        'SYNC_DEBT_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as DebtSyncPayload
  }

  private readExpenseCategoryPayload(
    payload: Record<string, unknown> | null,
  ): ExpenseCategorySyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Expense category sync payload is required.',
        'SYNC_EXPENSE_CATEGORY_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as ExpenseCategorySyncPayload
  }

  private readExpensePayload(payload: Record<string, unknown> | null): ExpenseSyncPayload {
    if (!payload || typeof payload !== 'object') {
      throw new AppBadRequestException(
        'Expense sync payload is required.',
        'SYNC_EXPENSE_PAYLOAD_REQUIRED',
      )
    }

    return payload as unknown as ExpenseSyncPayload
  }

  private prepareOperationPayload(
    entity: string,
    payload: Record<string, unknown> | null,
    user: JwtPayload,
  ) {
    if (!payload || typeof payload !== 'object') {
      return payload
    }

    if (entity === 'sale') {
      return {
        ...payload,
        fallbackCashierId:
          typeof payload.fallbackCashierId === 'string' && payload.fallbackCashierId.trim()
            ? payload.fallbackCashierId
            : user.sub,
      }
    }

    if (entity === 'expense') {
      return {
        ...payload,
        fallbackRecordedById:
          typeof payload.fallbackRecordedById === 'string' && payload.fallbackRecordedById.trim()
            ? payload.fallbackRecordedById
            : user.sub,
      }
    }

    if (entity === 'opening_balance') {
      return {
        ...payload,
        recordedById:
          typeof payload.recordedById === 'string' && UUID_REGEX.test(payload.recordedById)
            ? payload.recordedById
            : user.sub,
      }
    }

    if (entity === 'debt') {
      const payments = Array.isArray(payload.payments)
        ? payload.payments.map((payment) => {
            if (!payment || typeof payment !== 'object') {
              return payment
            }

            const candidate = payment as Record<string, unknown>
            return {
              ...candidate,
              recordedById:
                typeof candidate.recordedById === 'string' && UUID_REGEX.test(candidate.recordedById)
                  ? candidate.recordedById
                  : user.sub,
            }
          })
        : payload.payments

      return {
        ...payload,
        writtenOffById:
          typeof payload.writtenOffById === 'string' && UUID_REGEX.test(payload.writtenOffById)
            ? payload.writtenOffById
            : payload.status === DebtStatus.WRITTEN_OFF || Boolean(payload.writtenOffAt)
              ? user.sub
              : null,
        payments,
      }
    }

    return payload
  }

  private buildDebtSyncRecordId(sourceType: DebtSource, sourceId: string) {
    return `debt:${String(sourceType).toLowerCase()}:${sourceId}`
  }

  private normalizeOptionalString(value: string | null | undefined) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  /**
   * Only persist an image URL we actually serve. A synced record from an offline
   * device could carry an external/foreign URL; we drop those (no I/O on the hot
   * push path — the online upload already verified existence). External → null.
   */
  private sanitizeStoredImageUrl(value: string | null | undefined): string | null {
    const url = this.normalizeOptionalString(value)
    if (!url) return null
    return this.storage.keyFromUrl(url) ? url : null
  }

  private normalizeMoney(value: number | string | null | undefined) {
    const numeric = Number(value ?? 0)
    if (!Number.isFinite(numeric)) {
      return 0
    }

    return Math.round((numeric + Number.EPSILON) * 100) / 100
  }

  private async resolveContactCreatedById(businessId: string, createdById?: string | null) {
    if (createdById && UUID_REGEX.test(createdById)) {
      return createdById
    }

    const business = await this.businessesRepo.findOne({
      where: { id: businessId },
      select: ['id', 'ownerId'],
    })

    if (!business?.ownerId) {
      throw new AppBadRequestException(
        'Contact creator could not be resolved for sync.',
        'CONTACT_CREATED_BY_REQUIRED',
      )
    }

    return business.ownerId
  }

  private normalizeUnitNameCandidate(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase()
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) {
      return null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  private calculateAdjustmentQuantity(
    currentQuantity: number,
    payload: InventoryAdjustmentSyncPayload,
  ) {
    if (payload.type === StockAdjustmentType.ADD) {
      return currentQuantity + payload.quantity
    }

    if (payload.type === StockAdjustmentType.REMOVE) {
      return currentQuantity - payload.quantity
    }

    return payload.quantity
  }

  private async ensureValidDto(dto: object) {
    const errors = await validate(dto as never)

    if (errors.length === 0) {
      return
    }

    throw new AppBadRequestException(
      this.flattenValidationErrors(errors),
      'SYNC_PAYLOAD_INVALID',
    )
  }

  private flattenValidationErrors(errors: ValidationError[]): string {
    const messages: string[] = []

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints))
      }

      if (error.children?.length) {
        messages.push(this.flattenValidationErrors(error.children))
      }
    }

    return messages.filter(Boolean).join(', ') || 'Sync payload validation failed.'
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
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
