import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import { PaymentMethod, type SaleReturnPayload, type SaleSyncPayload } from '@biztrack/types'
import { BusinessMember } from '@/entities/business-member.entity'
import { Business } from '@/entities/business.entity'
import { Contact } from '@/entities/contact.entity'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { Debt } from '@/entities/debt.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement } from '@/entities/inventory-movement.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { Product } from '@/entities/product.entity'
import { ReviewFlagRecord } from '@/entities/review-flag.entity'
import { RoleLimitVersion } from '@/entities/role-limit-version.entity'
import { Role } from '@/entities/role.entity'
import { Sale } from '@/entities/sale.entity'
import { DebtsService } from '@/modules/debts/services/debts.service'
import { InventoryService } from '@/modules/inventory/services/inventory.service'
import { ReviewFlagsService } from '@/modules/review-flags/review-flags.service'
import {
  recordFirstRoleLimitVersion,
  recordRoleLimitChange,
} from '@/modules/roles/role-limit-versions'
import { DailySalesSummaryService } from '@/modules/sales/services/daily-sales-summary.service'
import { SaleNumberService } from '@/modules/sales/services/sale-number.service'
import { SalesService } from '@/modules/sales/services/sales.service'

// ---------------------------------------------------------------------------
// Builds the real sales write path against a real database: SalesService with the real
// inventory, debts, daily-summary and review-flag services. Only the edges that leave the
// process (notifications, audit queue, documents) or that are not under test (calendar,
// posting periods, customer deposits) are stand-ins.
//
// Every harness seeds its own business, so tests never see each other's rows and nothing
// needs truncating.
// ---------------------------------------------------------------------------

type Loose = Record<string, unknown>
const never = <T>(value: Loose): T => value as unknown as T

const utcDay = (instant: Date | string | number) => new Date(instant).toISOString().slice(0, 10)

export interface RoleLimits {
  maxDiscountPercent?: number | null
  maxCartDiscountPercent?: number | null
  maxDiscountAmountXaf?: number | null
  allowBelowCost?: boolean
}

export interface SalesSyncHarness {
  dataSource: DataSource
  sales: SalesService
  reviewFlags: ReviewFlagsService
  businessId: string
  /** The owner: cashier of every seeded sale, and the user REST calls act as. */
  userId: string
  /** Notifications the services dispatched, in order. */
  notifications: Loose[]
  seedProduct(input: { price: number; cost?: number; stock?: number }): Promise<string>
  seedSerialUnit(productId: string, serialNumber: string): Promise<string>
  /** Another member of the business, with a built-in role and no assigned role. */
  seedMember(role: 'MANAGER' | 'CASHIER'): Promise<string>
  /** A role with discount limits, in force from a given moment. */
  seedRole(input: RoleLimits & { effectiveFrom: string }): Promise<string>
  /** Edit a role's limits the way the roles screen does; returns the version now in force. */
  changeRoleLimits(roleId: string, limits: RoleLimits, effectiveFrom: string): Promise<number>
  assignRole(userId: string, roleId: string): Promise<void>
  roleVersions(roleId: string): Promise<RoleLimitVersion[]>
  /** A sale payload as a till sends it: one line per item, paid in cash unless told otherwise. */
  salePayload(input: {
    items: Array<{ productId: string; quantity: number; unitPrice: number; serialUnitId?: string }>
    paid?: number
    soldAt?: string
    overrides?: Partial<SaleSyncPayload>
  }): SaleSyncPayload
  /** The same sale re-pushed with a return on it. */
  withReturn(
    payload: SaleSyncPayload,
    ret: {
      items: Array<{ saleItemId: string; quantity: number }>
      refundAmount: number
      restock?: boolean
      createdAt?: string
      businessDate?: string
    },
    status?: 'REFUNDED' | 'PARTIALLY_REFUNDED',
  ): SaleSyncPayload
  stockOf(productId: string): Promise<number>
  summaryOf(day: string): Promise<DailySaleSummary | null>
  flagsOf(saleId: string): Promise<ReviewFlagRecord[]>
  saleRow(saleId: string): Promise<Sale>
  /** Acts as the owner through the REST path. */
  actor(): { sub: string; businessId: string; role: string; roleId: null }
}

export async function createSalesSyncHarness(dataSource: DataSource): Promise<SalesSyncHarness> {
  const notifications: Loose[] = []
  const i18n = never<never>({ translate: async (key: string) => key })
  const logger = never<never>({
    setContext() {},
    log() {},
    warn() {},
    error() {},
    debug() {},
  })
  const calendar = never<never>({
    businessDateFor: async (_businessId: string, instant: Date | string | number) =>
      utcDay(instant),
    resolveForSync: async (
      _businessId: string,
      instant: Date | string | number,
      provided?: string | null,
    ) => provided ?? utcDay(instant),
    computeForBusiness: async (_businessId: string, instant?: Date | string | number) =>
      utcDay(instant ?? Date.now()),
  })
  const postingDate = never<never>({
    resolve: async (_businessId: string, businessDate: string) => ({
      postingDate: businessDate,
      isLateArrival: false,
      originalPeriodId: null,
    }),
  })
  const dispatcher = never<never>({
    dispatch: async (notification: Loose) => {
      notifications.push(notification)
    },
  })
  const audit = never<never>({ log() {} })
  const savings = never<never>({
    recordSaleUsage: async () => undefined,
    createVoidedSaleTransaction: async () => undefined,
  })

  const debts = new DebtsService(
    dataSource,
    dataSource.getRepository(Debt),
    dataSource.getRepository(DebtPayment),
    dataSource.getRepository(Contact),
    never<never>({}),
    calendar,
    i18n,
    dispatcher,
    logger,
  )
  const inventory = new InventoryService(
    dataSource,
    dataSource.getRepository(Business),
    dataSource.getRepository(Product),
    dataSource.getRepository(InventoryLevel),
    dataSource.getRepository(InventoryMovement),
    dataSource.getRepository(ProductImage),
    debts,
    i18n,
    logger,
    audit,
    calendar,
  )
  const reviewFlags = new ReviewFlagsService(
    dataSource.getRepository(ReviewFlagRecord),
    dataSource.getRepository(Business),
    dataSource.getRepository(BusinessMember),
    dispatcher,
  )
  const sales = new SalesService(
    dataSource,
    dataSource.getRepository(Business),
    dataSource.getRepository(Sale),
    dataSource.getRepository(Contact),
    never<never>({}),
    debts,
    inventory,
    savings,
    new SaleNumberService(dataSource),
    new DailySalesSummaryService(dataSource.getRepository(DailySaleSummary)),
    audit,
    calendar,
    postingDate,
    i18n,
    never<never>({ get: () => undefined }),
    logger,
    reviewFlags,
  )

  // --- seed one business with its owner -------------------------------------
  const userId = randomUUID()
  const businessId = randomUUID()
  const tag = businessId.slice(0, 8)
  await dataSource.query(`INSERT INTO users (id, phone, name) VALUES ($1, $2, $3)`, [
    userId,
    `+2376${Math.floor(10000000 + Math.random() * 89999999)}`,
    `Owner ${tag}`,
  ])
  await dataSource.query(
    `INSERT INTO businesses (id, name, slug, owner_id) VALUES ($1, $2, $3, $4)`,
    [businessId, `Shop ${tag}`, `shop-${tag}`, userId],
  )
  await dataSource.query(
    `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
    [businessId, userId],
  )
  // Any unit will do: system units are seeded by the migrations.
  let [unit] = (await dataSource.query(`SELECT id FROM unit_of_measures LIMIT 1`)) as Array<{
    id: string
  }>
  if (!unit) {
    ;[unit] = (await dataSource.query(
      `INSERT INTO unit_of_measures (name, abbreviation, type)
       VALUES ('Piece', 'pc', (SELECT unnest(enum_range(NULL::unit_of_measures_type_enum)) LIMIT 1))
       RETURNING id`,
    )) as Array<{ id: string }>
  }
  const unitId = unit!.id

  return {
    dataSource,
    sales,
    reviewFlags,
    businessId,
    userId,
    notifications,

    async seedProduct({ price, cost, stock }) {
      const id = randomUUID()
      await dataSource.query(
        `INSERT INTO products (id, business_id, name, slug, price, cost_price, unit_of_measure_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, businessId, `Product ${id.slice(0, 6)}`, `product-${id}`, price, cost ?? null, unitId],
      )
      await dataSource.query(
        `INSERT INTO inventory_levels (business_id, product_id, quantity) VALUES ($1, $2, $3)`,
        [businessId, id, stock ?? 0],
      )
      return id
    },

    async seedSerialUnit(productId, serialNumber) {
      const id = randomUUID()
      await dataSource.query(`UPDATE products SET is_serialized = true WHERE id = $1`, [productId])
      await dataSource.query(
        `INSERT INTO product_serial_units (id, business_id, product_id, serial_number, serial_type)
         VALUES ($1, $2, $3, $4, 'IMEI')`,
        [id, businessId, productId, serialNumber],
      )
      return id
    },

    async seedMember(role) {
      const id = randomUUID()
      await dataSource.query(`INSERT INTO users (id, phone, name) VALUES ($1, $2, $3)`, [
        id,
        `+2376${Math.floor(10000000 + Math.random() * 89999999)}`,
        `${role} ${id.slice(0, 6)}`,
      ])
      await dataSource.query(
        `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, $3)`,
        [businessId, id, role],
      )
      return id
    },

    async seedRole({ effectiveFrom, ...limits }) {
      const roles = dataSource.getRepository(Role)
      const role = await roles.save(
        roles.create({
          businessId,
          name: `Role ${randomUUID().slice(0, 8)}`,
          description: null,
          maxDiscountPercent: limits.maxDiscountPercent ?? null,
          maxCartDiscountPercent: limits.maxCartDiscountPercent ?? null,
          maxDiscountAmountXaf: limits.maxDiscountAmountXaf ?? null,
          allowBelowCost: limits.allowBelowCost ?? false,
          colour: null,
          createdBy: null,
        }),
      )
      await recordFirstRoleLimitVersion(dataSource.manager, role, new Date(effectiveFrom))
      return role.id
    },

    changeRoleLimits(roleId, limits, effectiveFrom) {
      return dataSource.transaction(async (manager) => {
        const before = await manager.getRepository(Role).findOneOrFail({ where: { id: roleId } })
        await manager.getRepository(Role).update(roleId, limits)
        return recordRoleLimitChange(manager, before, new Date(effectiveFrom))
      })
    },

    async assignRole(memberUserId, roleId) {
      await dataSource.query(
        `UPDATE business_members SET role_id = $3 WHERE business_id = $1 AND user_id = $2`,
        [businessId, memberUserId, roleId],
      )
    },

    roleVersions(roleId) {
      return dataSource
        .getRepository(RoleLimitVersion)
        .find({ where: { roleId }, order: { version: 'ASC' } })
    },

    salePayload({ items, paid, soldAt, overrides }) {
      const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      const saleId = randomUUID()
      return {
        saleId,
        clientId: saleId,
        saleNumber: `VTE-${saleId.slice(0, 8)}`,
        soldAt: soldAt ?? new Date().toISOString(),
        cashierId: userId,
        payments:
          (paid ?? total) > 0
            ? [{ id: randomUUID(), method: PaymentMethod.CASH, amount: paid ?? total }]
            : [],
        items: items.map((item) => ({
          id: randomUUID(),
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          serialUnitId: item.serialUnitId,
        })),
        ...overrides,
      } as SaleSyncPayload
    },

    withReturn(payload, ret, status = 'PARTIALLY_REFUNDED') {
      const returned: SaleReturnPayload = {
        id: randomUUID(),
        createdAt: ret.createdAt,
        businessDate: ret.businessDate,
        restock: ret.restock ?? true,
        refundAmount: ret.refundAmount,
        items: ret.items.map((item) => ({ id: randomUUID(), ...item })),
        refundPayment:
          ret.refundAmount > 0
            ? { id: randomUUID(), method: PaymentMethod.CASH, amount: ret.refundAmount }
            : null,
      }
      return {
        ...payload,
        status,
        returns: [...(payload.returns ?? []), returned],
      } as SaleSyncPayload
    },

    async stockOf(productId) {
      const [row] = (await dataSource.query(
        `SELECT quantity FROM inventory_levels WHERE business_id = $1 AND product_id = $2`,
        [businessId, productId],
      )) as Array<{ quantity: string }>
      return Number(row?.quantity ?? 0)
    },

    summaryOf(day) {
      return dataSource
        .getRepository(DailySaleSummary)
        .findOne({ where: { businessId, summaryDate: day } })
    },

    flagsOf(saleId) {
      return dataSource
        .getRepository(ReviewFlagRecord)
        .find({ where: { businessId, entityId: saleId }, order: { code: 'ASC' } })
    },

    async saleRow(saleId) {
      return dataSource.getRepository(Sale).findOneOrFail({ where: { id: saleId, businessId } })
    },

    actor() {
      return { sub: userId, businessId, role: 'OWNER', roleId: null }
    },
  }
}
