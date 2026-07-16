import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { AppTooManyRequestsException } from '@/common/exceptions/app-exceptions'
import { RedisService } from '@/common/redis/redis.service'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

type LimitConfig = { maxAttempts: number; windowSeconds: number }

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private redis: RedisService,
    private i18n: I18nService<I18nTranslations>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const identifier = req.body?.identifier || req.body?.phone || req.body?.email
    if (!identifier) return true

    const path = `${req.baseUrl ?? ''}${req.route?.path ?? ''}`
    const config = this.getLimitConfig(path)
    if (!config) return true

    const key = `auth_attempts:${identifier}:${path}`
    const attempts = await this.redis.incr(key)
    if (attempts === 1) {
      await this.redis.expire(key, config.windowSeconds)
    }

    if (attempts > config.maxAttempts) {
      const ttl = await this.redis.ttl(key)
      throw new AppTooManyRequestsException(
        await this.i18n.translate('errors.rate_limited', { args: { seconds: ttl } }),
        'RATE_LIMITED',
        {
          retryAfter: ttl,
          lockUntil: Date.now() + ttl * 1000,
        },
      )
    }

    return true
  }

  private getLimitConfig(path: string): LimitConfig | null {
    const configs: Record<string, LimitConfig> = {
      '/auth/register': { maxAttempts: 5, windowSeconds: 900 },
      '/auth/verify-phone': { maxAttempts: 10, windowSeconds: 900 },
      '/auth/verify-email': { maxAttempts: 10, windowSeconds: 900 },
      '/auth/request-login': { maxAttempts: 10, windowSeconds: 900 },
      '/auth/login': { maxAttempts: 10, windowSeconds: 900 },
      '/auth/login-otp': { maxAttempts: 10, windowSeconds: 900 },
      '/auth/resend-otp': { maxAttempts: 3, windowSeconds: 600 },
      '/auth/request-password-reset': { maxAttempts: 3, windowSeconds: 600 },
      '/auth/reset-password': { maxAttempts: 10, windowSeconds: 900 },
      '/auth/refresh': { maxAttempts: 30, windowSeconds: 900 },
    }

    return configs[path] ?? null
  }
}
