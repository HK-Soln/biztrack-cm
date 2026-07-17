import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, In, Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppNotFoundException } from '@/common/exceptions/app.exception'
import { SupportTicket, TicketStatus } from '@/entities/support-ticket.entity'
import { Business } from '@/entities/read/business.entity'
import { SyncBatch } from '@/entities/read/sync-batch.entity'
import { CreateTicketDto } from './dto/create-ticket.dto'
import { UpdateTicketDto } from './dto/update-ticket.dto'
import { TicketFiltersDto } from './dto/ticket-filters.dto'

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket) private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(SyncBatch) private readonly syncRepo: Repository<SyncBatch>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  // ---- tickets -------------------------------------------------------------

  async listTickets(filters: TicketFiltersDto) {
    const page = Math.max(filters.page ?? 1, 1)
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100)

    const where: FindOptionsWhere<SupportTicket> = {}
    if (filters.status) where.status = filters.status
    if (filters.severity) where.severity = filters.severity
    if (filters.category) where.category = filters.category
    if (filters.assignedTo) where.assignedTo = filters.assignedTo
    if (filters.businessId) where.businessId = filters.businessId

    const [data, total] = await this.ticketRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    })
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async createTicket(dto: CreateTicketDto, createdBy: string) {
    const ticket = this.ticketRepo.create({
      businessId: dto.businessId ?? null,
      userId: dto.userId ?? null,
      createdBy,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      severity: dto.severity,
      status: TicketStatus.OPEN,
    })
    return this.ticketRepo.save(ticket)
  }

  async updateTicket(id: string, dto: UpdateTicketDto) {
    const ticket = await this.ticketRepo.findOne({ where: { id } })
    if (!ticket) throw new AppNotFoundException('Ticket not found.', 'TICKET_NOT_FOUND')

    if (dto.status !== undefined) ticket.status = dto.status
    if (dto.severity !== undefined) ticket.severity = dto.severity
    if (dto.assignedTo !== undefined) ticket.assignedTo = dto.assignedTo
    if (dto.resolution !== undefined) ticket.resolution = dto.resolution

    // Stamp resolved_at when moving into a terminal state.
    const terminal = dto.status === TicketStatus.RESOLVED || dto.status === TicketStatus.CLOSED
    if (terminal && !ticket.resolvedAt) ticket.resolvedAt = new Date()
    if (dto.status && !terminal) ticket.resolvedAt = null

    return this.ticketRepo.save(ticket)
  }

  // ---- sync errors ---------------------------------------------------------

  async listSyncErrors() {
    const rows = await this.syncRepo
      .createQueryBuilder('sb')
      .select('sb.business_id', 'businessId')
      .addSelect('SUM(sb.failed_count)', 'failedTotal')
      .addSelect('SUM(sb.conflict_count)', 'conflictTotal')
      .addSelect('MAX(sb.created_at)', 'lastSyncAt')
      .addSelect('COUNT(*)', 'batchCount')
      .where('sb.deleted_at IS NULL')
      .andWhere('sb.failed_count > 0')
      .groupBy('sb.business_id')
      .orderBy('MAX(sb.created_at)', 'DESC')
      .getRawMany<{
        businessId: string
        failedTotal: string
        conflictTotal: string
        lastSyncAt: string
        batchCount: string
      }>()

    const ids = rows.map((r) => r.businessId)
    const businesses = ids.length ? await this.businessRepo.find({ where: { id: In(ids) } }) : []
    const nameById = new Map(businesses.map((b) => [b.id, b.name]))

    return rows.map((r) => ({
      businessId: r.businessId,
      businessName: nameById.get(r.businessId) ?? null,
      failedCount: Number(r.failedTotal),
      conflictCount: Number(r.conflictTotal),
      batchCount: Number(r.batchCount),
      lastSyncAt: r.lastSyncAt,
    }))
  }

  async resolveSyncErrors(businessId: string) {
    const business = await this.businessRepo.findOne({ where: { id: businessId } })
    if (!business || business.deletedAt)
      throw new AppNotFoundException('Business not found.', 'BUSINESS_NOT_FOUND')

    // NOTE: triggering an actual re-sync requires the client API's Bull queue, which the
    // admin API does not share. This records the acknowledgement (audit-logged); the
    // re-sync itself is a follow-up once a cross-service trigger exists.
    this.logger.log('Sync errors acknowledged by admin (re-sync not triggered)', 'SupportService', {
      businessId,
    })
    return { status: 'acknowledged' as const, reSyncTriggered: false }
  }
}
