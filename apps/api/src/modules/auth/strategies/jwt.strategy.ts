import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { BusinessMemberStatus, JwtPayload } from '@biztrack/types'
import type { OnboardingStep } from '@/entities/user.entity'
import type { Locale } from '@/common/enums/locale.enum'
import { AuthUsersRepository } from '../repositories/auth-users.repository'
import { BusinessMembersRepository } from '../repositories/business-members.repository'
import { RedisService } from '@/common/redis/redis.service'
import { MEMBER_STATUS_TTL_SECONDS, memberStatusCacheKey } from '@/common/membership/membership-cache'
import type { AppConfig } from '@/config/configuration'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig>,
    private usersRepo: AuthUsersRepository,
    private membersRepo: BusinessMembersRepository,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersRepo.findOne({ where: { id: payload.sub } })
    if (!user || !user.isActive) throw new UnauthorizedException()

    // Phase-2 (business-scoped) tokens: enforce the membership is still ACTIVE on every
    // request, so a suspended/removed member loses platform access immediately — not
    // only when their access token expires or refreshes. Status is cached in Redis so
    // this doesn't hit the DB per request; the key is invalidated on revoke/reactivate.
    if (payload.type === 'phase2' && payload.businessId) {
      const key = memberStatusCacheKey(payload.businessId, payload.sub)
      let status = await this.redis.get(key)
      if (!status) {
        const membership = await this.membersRepo.findOne({
          where: { businessId: payload.businessId, userId: payload.sub },
        })
        status = membership?.status ?? 'NONE'
        await this.redis.setex(key, MEMBER_STATUS_TTL_SECONDS, status)
      }
      if (status !== BusinessMemberStatus.ACTIVE) throw new UnauthorizedException()
    }

    return {
      ...payload,
      onboardingStep: user.onboardingStep as OnboardingStep,
      language: user.language as Locale,
    }
  }
}
