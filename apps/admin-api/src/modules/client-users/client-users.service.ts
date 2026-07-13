import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { RedisService } from '@/common/redis/redis.service'
import { AppException, AppNotFoundException } from '@/common/exceptions/app.exception'
import { HttpStatus } from '@nestjs/common'
import { ClientUser } from '@/entities/read/client-user.entity'
import { BusinessMember } from '@/entities/read/business-member.entity'
import { ClientUserFiltersDto } from './dto/client-user-filters.dto'
import { ResendOtpDto } from './dto/resend-otp.dto'

const OTP_RESEND_LIMIT = 3
const OTP_RESEND_WINDOW_SECONDS = 3600 // 1 hour

@Injectable()
export class ClientUsersService {
  constructor(
    @InjectRepository(ClientUser) private readonly userRepo: Repository<ClientUser>,
    @InjectRepository(BusinessMember) private readonly memberRepo: Repository<BusinessMember>,
    private readonly redis: RedisService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async findAll(filters: ClientUserFiltersDto) {
    const page = Math.max(filters.page ?? 1, 1)
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100)

    const qb = this.userRepo.createQueryBuilder('u').where('u.deleted_at IS NULL')
    if (filters.status) qb.andWhere('u.status = :status', { status: filters.status })
    if (filters.search) {
      qb.andWhere('(u.name ILIKE :q OR u.phone ILIKE :q OR u.email ILIKE :q)', {
        q: `%${filters.search}%`,
      })
    }
    qb.orderBy('u.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    const [rows, total] = await qb.getManyAndCount()
    return {
      data: rows.map((u) => this.toSummary(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({ where: { id } })
    if (!user || user.deletedAt) throw new AppNotFoundException('User not found.', 'USER_NOT_FOUND')

    const memberships = await this.memberRepo.find({
      where: { userId: id },
      relations: ['business'],
    })
    return {
      ...this.toSummary(user),
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      onboardingStep: user.onboardingStep,
      language: user.language,
      lockedUntil: user.lockedUntil ?? null,
      memberships: memberships.map((m) => ({
        businessId: m.businessId,
        businessName: m.business?.name ?? null,
        role: m.role,
        status: m.status,
      })),
    }
  }

  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', _reason: string) {
    const user = await this.userRepo.findOne({ where: { id } })
    if (!user || user.deletedAt) throw new AppNotFoundException('User not found.', 'USER_NOT_FOUND')

    await this.userRepo.update(id, { isActive: status === 'ACTIVE' })
    return this.findOne(id)
  }

  async resendOtp(id: string, dto: ResendOtpDto) {
    const user = await this.userRepo.findOne({ where: { id } })
    if (!user || user.deletedAt) throw new AppNotFoundException('User not found.', 'USER_NOT_FOUND')

    // Rate limit: 3 per user per hour.
    const key = `admin_otp_resend:${id}`
    const count = await this.redis.incr(key)
    if (count === 1) await this.redis.expire(key, OTP_RESEND_WINDOW_SECONDS)
    if (count > OTP_RESEND_LIMIT) {
      throw new AppException(
        'OTP resend limit reached. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_RATE_LIMITED',
      )
    }

    // NOTE: actually delivering the OTP requires the client API's OTP + SMS/WhatsApp
    // pipeline, which the admin API does not share. Recorded + audit-logged; delivery TODO.
    this.logger.log('Admin requested OTP resend (delivery not wired)', 'ClientUsersService', {
      userId: id,
      type: dto.type ?? 'PHONE_VERIFY',
      channel: dto.channel ?? 'SMS',
      attempt: count,
    })

    return { status: 'queued' as const, deliveryWired: false, attemptsThisHour: count }
  }

  private toSummary(u: ClientUser) {
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email ?? null,
      status: u.status,
      role: u.role,
      isActive: u.isActive,
      businessId: u.businessId ?? null,
      createdAt: u.createdAt,
    }
  }
}
