import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type {
  CustomerDeposit as CustomerDepositModel,
  DepositStatement,
  DepositStatementEntry,
  DepositReceipt,
  DepositReport,
  DepositReportEntry,
  DepositStatus,
  DepositOutcome,
  JwtPayload,
  PaginatedResult,
  SavingsAccountSyncPayload,
  SavingsTransactionSyncPayload,
} from '@biztrack/types'
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { DepositTransaction } from '@/entities/deposit-transaction.entity'
import type { AddDepositPaymentDto, CloseDepositDto, CreateDepositDto, ListDepositsQueryDto } from '../dto/deposit.dto'

const round = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100
const newId = (): string => crypto.randomUUID()
const accountNumberFor = (id: string): string => `DEP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(0, 4).toUpperCase()}`

export interface DepositSummary {
  openCount: number
  depositsHeld: number
  collectedCount: number
  collectedAmount: number
  refundedTransferredCount: number
  refundedTransferredAmount: number
  currency: string
}

@Injectable()
export class DepositsService {
  constructor(
    @InjectRepository(CustomerDeposit)
    private readonly savingsAccountsRepo: Repository<CustomerDeposit>,
    @InjectRepository(DepositTransaction)
    private readonly savingsTransactionsRepo: Repository<DepositTransaction>,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    private readonly dataSource: DataSource,
  ) {}

  /** Structured receipt payload for a single deposit/refund transaction (mirrors desktop). */
  async buildDepositReceipt(transactionId: string, businessId: string): Promise<DepositReceipt> {
    const tx = await this.savingsTransactionsRepo.findOne({ where: { id: transactionId, businessId } })
    if (!tx || (tx.type !== 'deposit' && tx.type !== 'refund')) {
      throw new AppNotFoundException('Deposit receipt not found.', 'DEPOSIT_RECEIPT_NOT_FOUND')
    }
    const acc = await this.savingsAccountsRepo.findOne({ where: { id: tx.savingsId, businessId } })
    if (!acc) throw new AppNotFoundException('Deposit session not found.', 'DEPOSIT_NOT_FOUND')
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })
    // Running balance through (and including) this transaction, chronologically.
    const txns = await this.savingsTransactionsRepo.find({
      where: { savingsId: tx.savingsId, businessId },
      order: { occurredAt: 'ASC', createdAt: 'ASC' },
    })
    let balanceAfter = 0
    for (const t of txns) {
      balanceAfter = round(balanceAfter + (t.direction === 'inbound' ? t.amount : -t.amount))
      if (t.id === tx.id) break
    }
    return {
      businessName: business?.name ?? 'BizTrack',
      businessPhone: business?.phone ?? null,
      businessAddress: business?.address ?? null,
      receiptNumber: `${acc.accountNumber}-R${tx.id.slice(0, 4).toUpperCase()}`,
      sessionRef: acc.accountNumber,
      occurredAt: tx.occurredAt.toISOString(),
      customerName: acc.customerName ?? null,
      customerPhone: acc.customerPhone ?? null,
      kind: tx.type === 'refund' ? 'refund' : 'deposit',
      amount: round(tx.amount),
      method: tx.method ?? null,
      balanceAfter: round(balanceAfter),
      totalDeposited: round(acc.totalDeposited),
      currency: business?.currency ?? null,
    }
  }

  /** Full deposit session report: header, totals, tagged items, running-balance statement. */
  async buildDepositReport(id: string, businessId: string): Promise<DepositReport> {
    const acc = await this.savingsAccountsRepo.findOne({ where: { id, businessId } })
    if (!acc) throw new AppNotFoundException('Deposit session not found.', 'DEPOSIT_NOT_FOUND')
    const business = await this.businessesRepo.findOne({ where: { id: businessId } })
    const txns = await this.savingsTransactionsRepo.find({
      where: { savingsId: id, businessId },
      order: { occurredAt: 'ASC', createdAt: 'ASC' },
    })
    let running = 0
    const entries: DepositReportEntry[] = txns.map((t) => {
      running = round(running + (t.direction === 'inbound' ? t.amount : -t.amount))
      return {
        occurredAt: t.occurredAt.toISOString(),
        type: t.type as DepositReportEntry['type'],
        direction: t.direction as DepositReportEntry['direction'],
        amount: round(t.amount),
        method: t.method ?? null,
        notes: t.notes ?? null,
        runningBalance: running,
      }
    })
    return {
      businessName: business?.name ?? 'BizTrack',
      businessPhone: business?.phone ?? null,
      businessAddress: business?.address ?? null,
      sessionRef: acc.accountNumber,
      createdAt: acc.createdAt.toISOString(),
      status: acc.status as DepositStatus,
      outcome: (acc.outcome as DepositOutcome) ?? null,
      closedAt: acc.closedAt ? acc.closedAt.toISOString() : null,
      customerName: acc.customerName ?? null,
      customerPhone: acc.customerPhone ?? null,
      totalDeposited: round(acc.totalDeposited),
      totalUsed: round(acc.totalUsed),
      totalRefunded: round(acc.totalRefunded),
      totalTransferred: round(acc.totalTransferred),
      balance: round(acc.balance),
      currency: business?.currency ?? null,
      taggedProducts: acc.taggedProducts ?? [],
      entries,
    }
  }

  /** Deposit headline stats (open held + this-month collected/refunded), mirroring the desktop. */
  async getSummary(businessId: string): Promise<DepositSummary> {
    const mgr = this.savingsAccountsRepo.manager
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const [open] = (await mgr.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(balance), 0) AS held
       FROM savings_accounts WHERE business_id = $1 AND status = 'OPEN' AND is_deleted = false`,
      [businessId],
    )) as Array<{ n: number; held: string }>
    const [collected] = (await mgr.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(total_used), 0) AS amt
       FROM savings_accounts WHERE business_id = $1 AND status = 'CLOSED' AND outcome LIKE 'COLLECTED%'
         AND closed_at >= $2 AND is_deleted = false`,
      [businessId, monthStart],
    )) as Array<{ n: number; amt: string }>
    const [refTr] = (await mgr.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(total_refunded + total_transferred), 0) AS amt
       FROM savings_accounts WHERE business_id = $1 AND status = 'CLOSED' AND closed_at >= $2
         AND (total_refunded > 0 OR total_transferred > 0) AND is_deleted = false`,
      [businessId, monthStart],
    )) as Array<{ n: number; amt: string }>
    const [biz] = (await mgr.query(`SELECT currency FROM businesses WHERE id = $1`, [businessId])) as Array<{
      currency: string | null
    }>
    return {
      openCount: Number(open?.n ?? 0),
      depositsHeld: round(Number(open?.held ?? 0)),
      collectedCount: Number(collected?.n ?? 0),
      collectedAmount: round(Number(collected?.amt ?? 0)),
      refundedTransferredCount: Number(refTr?.n ?? 0),
      refundedTransferredAmount: round(Number(refTr?.amt ?? 0)),
      currency: biz?.currency ?? 'XAF',
    }
  }

  // ---- REST (cloud direct) — mirrors the desktop deposit-session ops --------

  /** Open a new deposit session (fails if the customer already has one open). */
  async create(businessId: string, user: JwtPayload, dto: CreateDepositDto): Promise<CustomerDeposit> {
    const open = await this.savingsAccountsRepo.findOne({ where: { businessId, customerId: dto.customerId, status: 'OPEN', isDeleted: false } })
    if (open) throw new AppBadRequestException('This customer already has an open deposit session.', 'DEPOSIT_OPEN_EXISTS')
    const now = new Date()
    const id = newId()
    const initial = round(dto.initialDeposit?.amount ?? 0)
    await this.savingsAccountsRepo.save(
      this.savingsAccountsRepo.create({
        id,
        businessId,
        customerId: dto.customerId,
        accountNumber: accountNumberFor(id),
        balance: initial,
        totalDeposited: initial,
        totalRefunded: 0,
        totalUsed: 0,
        totalTransferred: 0,
        status: 'OPEN',
        taggedProducts: dto.taggedProducts ?? null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      }),
    )
    if (initial > 0) {
      await this.insertTxn(this.savingsTransactionsRepo.manager, id, businessId, { type: 'deposit', direction: 'inbound', amount: initial, method: dto.initialDeposit?.method ?? 'CASH', mobileMoneyReference: dto.initialDeposit?.mobileMoneyReference, notes: dto.initialDeposit?.notes, recordedById: user.sub }, now)
    }
    return this.findById(id, businessId)
  }

  async list(businessId: string, query: ListDepositsQueryDto): Promise<PaginatedResult<CustomerDeposit>> {
    const page = Math.max(1, query.page ?? 1)
    const limit = Math.min(100, Math.max(1, query.limit ?? 20))
    const qb = this.savingsAccountsRepo
      .createQueryBuilder('s')
      .where('s.business_id = :businessId AND s.is_deleted = false', { businessId })
    if (query.status) qb.andWhere('s.status = :status', { status: query.status })
    if (query.search?.trim()) {
      const q = `%${query.search.trim()}%`
      qb.andWhere(new Brackets((w) => w.where('s.customer_name ILIKE :q', { q }).orWhere('s.account_number ILIKE :q', { q })))
    }
    qb.orderBy(`CASE WHEN s.status = 'OPEN' THEN 0 ELSE 1 END`, 'ASC').addOrderBy('s.created_at', 'DESC').skip((page - 1) * limit).take(limit)
    const [rows, total] = await qb.getManyAndCount()
    const data = await Promise.all(rows.map((r) => this.withSalesCount(r)))
    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
  }

  async findById(id: string, businessId: string): Promise<CustomerDeposit> {
    const acc = await this.savingsAccountsRepo.findOne({ where: { id, businessId } })
    if (!acc) throw new AppNotFoundException('Deposit session not found.', 'DEPOSIT_NOT_FOUND')
    return this.withSalesCount(acc)
  }

  async getOpenForCustomer(customerId: string, businessId: string): Promise<CustomerDeposit | null> {
    const acc = await this.savingsAccountsRepo.findOne({ where: { businessId, customerId, status: 'OPEN', isDeleted: false } })
    return acc ? this.withSalesCount(acc) : null
  }

  async getStatement(id: string, businessId: string): Promise<DepositStatement> {
    const account = await this.findById(id, businessId)
    const txns = await this.savingsTransactionsRepo.find({ where: { savingsId: id, businessId }, order: { occurredAt: 'ASC', createdAt: 'ASC' } })
    let running = 0
    const entries: DepositStatementEntry[] = txns.map((t) => {
      running = round(running + (t.direction === 'inbound' ? t.amount : -t.amount))
      return { id: t.id, type: t.type as DepositStatementEntry['type'], direction: t.direction as DepositStatementEntry['direction'], amount: t.amount, method: t.method ?? null, mobileMoneyReference: t.mobileMoneyReference ?? null, saleId: t.saleId ?? null, notes: t.notes ?? null, occurredAt: t.occurredAt.toISOString(), createdAt: t.createdAt.toISOString(), runningBalance: running }
    })
    return { account: account as unknown as CustomerDepositModel, entries }
  }

  async addPayment(id: string, businessId: string, user: JwtPayload, dto: AddDepositPaymentDto): Promise<CustomerDeposit> {
    const acc = await this.requireOpen(id, businessId)
    const amount = round(dto.amount)
    if (amount <= 0) throw new AppBadRequestException('Deposit amount must be greater than 0.', 'DEPOSIT_AMOUNT_INVALID')
    const now = new Date()
    await this.dataSource.transaction(async (m) => {
      await m.getRepository(CustomerDeposit).update(acc.id, { balance: round(acc.balance + amount), totalDeposited: round(acc.totalDeposited + amount), updatedAt: now })
      await this.insertTxn(m, id, businessId, { type: 'deposit', direction: 'inbound', amount, method: dto.method ?? 'CASH', mobileMoneyReference: dto.mobileMoneyReference, notes: dto.notes, recordedById: user.sub }, now)
    })
    return this.findById(id, businessId)
  }

  async close(id: string, businessId: string, user: JwtPayload, dto: CloseDepositDto): Promise<CustomerDeposit> {
    const acc = await this.requireOpen(id, businessId)
    const leftover = round(acc.balance)
    const salesCount = await this.savingsTransactionsRepo.count({ where: { savingsId: id, businessId, type: 'sale' } })
    const hasSales = salesCount > 0
    const now = new Date()

    await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(CustomerDeposit)
      if (dto.settlement === 'NONE') {
        if (leftover > 0) throw new AppBadRequestException('There is a leftover balance — refund it or transfer it.', 'DEPOSIT_LEFTOVER')
      } else if (dto.settlement === 'REFUND') {
        if (leftover <= 0) throw new AppBadRequestException('Nothing to refund.', 'DEPOSIT_NOTHING_TO_REFUND')
        await this.insertTxn(m, id, businessId, { type: 'refund', direction: 'outbound', amount: leftover, method: dto.method ?? 'CASH', mobileMoneyReference: dto.mobileMoneyReference, notes: dto.notes, recordedById: user.sub }, now)
        await repo.update(id, { balance: 0, totalRefunded: round(acc.totalRefunded + leftover), updatedAt: now })
      } else {
        if (!hasSales) throw new AppBadRequestException('A session with no goods collected cannot be transferred — refund it instead.', 'DEPOSIT_TRANSFER_NO_SALES')
        if (leftover <= 0) throw new AppBadRequestException('Nothing to transfer.', 'DEPOSIT_NOTHING_TO_TRANSFER')
        await this.insertTxn(m, id, businessId, { type: 'transfer_out', direction: 'outbound', amount: leftover, notes: dto.notes, recordedById: user.sub }, now)
        await repo.update(id, { balance: 0, totalTransferred: round(acc.totalTransferred + leftover), updatedAt: now })
        const nid = newId()
        await repo.save(repo.create({ id: nid, businessId, customerId: acc.customerId, customerName: acc.customerName ?? null, customerPhone: acc.customerPhone ?? null, accountNumber: accountNumberFor(nid), balance: leftover, totalDeposited: leftover, totalRefunded: 0, totalUsed: 0, totalTransferred: 0, status: 'OPEN', isDeleted: false, createdAt: now, updatedAt: now }))
        await this.insertTxn(m, nid, businessId, { type: 'transfer_in', direction: 'inbound', amount: leftover, notes: `From ${acc.accountNumber}`, recordedById: user.sub }, now)
        await repo.update(id, { transferredToId: nid })
      }
      const outcome = !hasSales ? 'REFUNDED' : dto.settlement === 'REFUND' ? 'COLLECTED_REFUNDED' : dto.settlement === 'TRANSFER' ? 'COLLECTED_TRANSFERRED' : 'COLLECTED'
      await repo.update(id, { status: 'CLOSED', outcome, closedAt: now, closedById: user.sub, updatedAt: now })
    })
    return this.findById(id, businessId)
  }

  private async requireOpen(id: string, businessId: string): Promise<CustomerDeposit> {
    const acc = await this.savingsAccountsRepo.findOne({ where: { id, businessId, isDeleted: false } })
    if (!acc) throw new AppNotFoundException('Deposit session not found.', 'DEPOSIT_NOT_FOUND')
    if (acc.status !== 'OPEN') throw new AppBadRequestException('This deposit session is closed.', 'DEPOSIT_CLOSED')
    return acc
  }

  private async withSalesCount(acc: CustomerDeposit): Promise<CustomerDeposit> {
    const salesCount = await this.savingsTransactionsRepo.count({ where: { savingsId: acc.id, businessId: acc.businessId, type: 'sale' } })
    return Object.assign(acc, { salesCount }) as CustomerDeposit
  }

  /**
   * Draw down a customer deposit for a SAVINGS payment on a sale: deduct the balance and
   * record an outbound usage transaction. Must run inside the sale's transaction so a
   * failure here rolls the whole sale back. Mirrors the desktop `recordSaleUsage`.
   */
  async recordSaleUsage(
    m: EntityManager,
    businessId: string,
    input: { savingsId: string; saleId: string; amount: number; recordedById?: string | null },
    now: Date,
  ): Promise<void> {
    const amount = round(input.amount)
    if (amount <= 0) return
    const repo = m.getRepository(CustomerDeposit)
    const acc = await repo.findOne({ where: { id: input.savingsId, businessId, isDeleted: false } })
    if (!acc) throw new AppBadRequestException('Deposit account not found.', 'DEPOSIT_NOT_FOUND')
    if (acc.status !== 'OPEN') throw new AppBadRequestException('This deposit session is closed.', 'DEPOSIT_CLOSED')
    if (acc.balance < amount) {
      throw new AppBadRequestException('Insufficient deposit balance.', 'DEPOSIT_INSUFFICIENT_BALANCE')
    }
    await repo.update(acc.id, {
      balance: round(acc.balance - amount),
      totalUsed: round(acc.totalUsed + amount),
      updatedAt: now,
    })
    await this.insertTxn(
      m,
      input.savingsId,
      businessId,
      {
        type: 'sale',
        direction: 'outbound',
        amount,
        method: 'SAVINGS',
        saleId: input.saleId,
        recordedById: input.recordedById,
      },
      now,
    )
  }

  private async insertTxn(
    m: EntityManager,
    savingsId: string,
    businessId: string,
    tx: { type: string; direction: string; amount: number; method?: string | null; mobileMoneyReference?: string | null; notes?: string | null; saleId?: string | null; recordedById?: string | null },
    now: Date,
  ): Promise<void> {
    const repo = m.getRepository(DepositTransaction)
    await repo.save(
      repo.create({
        id: newId(),
        savingsId,
        businessId,
        type: tx.type,
        direction: tx.direction,
        amount: round(tx.amount),
        method: tx.method ?? null,
        mobileMoneyReference: tx.mobileMoneyReference ?? null,
        saleId: tx.saleId ?? null,
        notes: tx.notes ?? null,
        recordedById: tx.recordedById ?? null,
        occurredAt: now,
        isDeleted: false,
        createdAt: now,
      }),
    )
  }

  async applySavingsAccountOperation(
    businessId: string,
    payload: SavingsAccountSyncPayload,
  ): Promise<void> {
    const existing = await this.savingsAccountsRepo.findOne({
      where: { id: payload.savingsId, businessId },
    })

    if (!existing) {
      await this.savingsAccountsRepo.save(
        this.savingsAccountsRepo.create({
          id: payload.savingsId,
          businessId,
          customerId: payload.customerId,
          customerName: payload.customerName ?? null,
          customerPhone: payload.customerPhone ?? null,
          accountNumber: payload.accountNumber,
          balance: payload.balance,
          totalDeposited: payload.totalDeposited,
          totalRefunded: payload.totalRefunded,
          totalUsed: payload.totalUsed,
          totalTransferred: payload.totalTransferred ?? 0,
          status: payload.status ?? 'OPEN',
          outcome: payload.outcome ?? null,
          closedAt: payload.closedAt ? new Date(payload.closedAt) : null,
          closedById: payload.closedById ?? null,
          transferredToId: payload.transferredToId ?? null,
          taggedProducts: payload.taggedProducts ?? null,
          isDeleted: false,
          createdAt: new Date(payload.createdAt),
          updatedAt: new Date(payload.updatedAt),
        }),
      )
    } else {
      await this.savingsAccountsRepo.update(existing.id, {
        balance: payload.balance,
        totalDeposited: payload.totalDeposited,
        totalRefunded: payload.totalRefunded,
        totalUsed: payload.totalUsed,
        totalTransferred: payload.totalTransferred ?? 0,
        status: payload.status ?? 'OPEN',
        outcome: payload.outcome ?? null,
        closedAt: payload.closedAt ? new Date(payload.closedAt) : null,
        closedById: payload.closedById ?? null,
        transferredToId: payload.transferredToId ?? null,
        taggedProducts: payload.taggedProducts ?? null,
        customerName: payload.customerName ?? null,
        customerPhone: payload.customerPhone ?? null,
        updatedAt: new Date(payload.updatedAt),
      })
    }
  }

  async applyTransactionOperation(
    businessId: string,
    payload: SavingsTransactionSyncPayload,
  ): Promise<void> {
    const existing = await this.savingsTransactionsRepo.findOne({
      where: { id: payload.transactionId, businessId },
    })

    if (existing) {
      return
    }

    await this.savingsTransactionsRepo.save(
      this.savingsTransactionsRepo.create({
        id: payload.transactionId,
        savingsId: payload.savingsId,
        businessId,
        type: payload.type,
        direction: payload.direction,
        amount: payload.amount,
        method: payload.method ?? null,
        mobileMoneyReference: payload.mobileMoneyReference ?? null,
        saleId: payload.saleId ?? null,
        notes: payload.notes ?? null,
        recordedById: payload.recordedById ?? null,
        occurredAt: new Date(payload.occurredAt),
        isDeleted: false,
        createdAt: new Date(payload.createdAt),
      }),
    )
    // Account balance is maintained by the savings account sync record which is pushed alongside every transaction
  }

  async createVoidedSaleTransaction(
    businessId: string,
    savingsAccountId: string,
    saleId: string,
    amount: number,
    voidedAt: Date,
  ): Promise<void> {
    const txId = crypto.randomUUID()
    await this.savingsTransactionsRepo.save(
      this.savingsTransactionsRepo.create({
        id: txId,
        savingsId: savingsAccountId,
        businessId,
        type: 'voided_sale',
        direction: 'inbound',
        amount,
        method: null,
        mobileMoneyReference: null,
        saleId,
        notes: null,
        recordedById: null,
        occurredAt: voidedAt,
        isDeleted: false,
        createdAt: voidedAt,
      }),
    )

    // Credit money back to the account
    await this.savingsAccountsRepo
      .createQueryBuilder()
      .update()
      .set({
        balance: () => `balance + ${amount}`,
        totalUsed: () => `GREATEST(total_used - ${amount}, 0)`,
        updatedAt: voidedAt,
      })
      .where('id = :id AND business_id = :businessId', { id: savingsAccountId, businessId })
      .execute()
  }

  async findByBusiness(
    businessId: string,
    cursor: Date,
    pulledAt: Date,
  ): Promise<{
    accounts: CustomerDeposit[]
    transactions: DepositTransaction[]
  }> {
    const [accounts, transactions] = await Promise.all([
      this.savingsAccountsRepo
        .createQueryBuilder('sa')
        .where('sa.business_id = :businessId', { businessId })
        .andWhere('sa.updated_at > :cursor', { cursor })
        .andWhere('sa.updated_at <= :pulledAt', { pulledAt })
        .orderBy('sa.updated_at', 'ASC')
        .getMany(),
      this.savingsTransactionsRepo
        .createQueryBuilder('st')
        .where('st.business_id = :businessId', { businessId })
        .andWhere('st.created_at > :cursor', { cursor })
        .andWhere('st.created_at <= :pulledAt', { pulledAt })
        .orderBy('st.created_at', 'ASC')
        .getMany(),
    ])

    return { accounts, transactions }
  }
}
