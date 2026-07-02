import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BusinessMemberStatus, type JwtPayload } from '@biztrack/types'
import { BusinessMember } from '@/entities/business-member.entity'
import { RedisService } from '@/common/redis/redis.service'
import { MEMBER_STATUS_TTL_SECONDS, memberStatusCacheKey } from '@/common/membership/membership-cache'
import type { AppConfig } from '@/config/configuration'
import type { Principal } from '../realtime.types'

/**
 * Realtime authentication — ACCESS TOKEN ONLY. The sync token is never accepted here;
 * it stays scoped to SyncModule's HTTP API. The same access token used to log in (and
 * to obtain a sync token) authenticates the websocket, so one connection covers
 * notifications + (later) sync-completion events published server-side.
 */
@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig>,
    @InjectRepository(BusinessMember) private readonly membersRepo: Repository<BusinessMember>,
    private readonly redis: RedisService,
  ) {}

  /** Verify an access token → Principal. Returns null for invalid/expired/sync tokens. */
  verifyAccessToken(token: string): Principal | null {
    try {
      const payload = this.jwt.verify<JwtPayload & { exp?: number }>(token, {
        secret: this.config.get('JWT_SECRET', { infer: true }),
      })
      if (!payload?.sub || payload.type === 'sync') return null
      return {
        userId: payload.sub,
        businessId: payload.businessId ?? null,
        role: (payload.role as string | null) ?? null,
        deviceId: payload.deviceId ?? null,
        type: payload.type === 'phase2' ? 'phase2' : 'phase1',
        exp: payload.exp ?? null,
      }
    } catch {
      return null
    }
  }

  /**
   * Is the user an ACTIVE member of the business? Reuses the same Redis-cached status
   * as JwtStrategy (invalidated on suspend/reactivate/remove), so suspended members are
   * denied business channels immediately without a per-subscribe DB hit.
   */
  async hasActiveMembership(businessId: string, userId: string): Promise<boolean> {
    const key = memberStatusCacheKey(businessId, userId)
    let status = await this.redis.get(key)
    if (!status) {
      const membership = await this.membersRepo.findOne({ where: { businessId, userId } })
      status = membership?.status ?? 'NONE'
      await this.redis.setex(key, MEMBER_STATUS_TTL_SECONDS, status)
    }
    return status === BusinessMemberStatus.ACTIVE
  }
}
