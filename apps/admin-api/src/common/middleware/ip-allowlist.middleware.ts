import { Inject, Injectable, NestMiddleware } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { NextFunction } from 'express'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { AppConfig } from '@/config/configuration'
import { AppForbiddenException } from '../exceptions/app.exception'
import type { RequestWithId, ResponseWithId } from '../http/http-types'

/**
 * Restricts access to a configured set of IPs. When ADMIN_ALLOWED_IPS is empty
 * (typical in local dev) the middleware is a no-op so developers aren't locked out.
 * Set it in production (office + VPN IPs) to enforce.
 */
@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
  private readonly allowed: Set<string>

  constructor(config: ConfigService<AppConfig>, @Inject(LOGGER) private logger: Logger) {
    const raw = config.get('ADMIN_ALLOWED_IPS', { infer: true }) ?? ''
    this.allowed = new Set(
      raw
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean),
    )
  }

  use(req: RequestWithId, _res: ResponseWithId, next: NextFunction) {
    if (this.allowed.size === 0) return next() // open in dev

    const ip = this.normalize(req.ip ?? req.socket?.remoteAddress ?? '')
    if (this.allowed.has(ip)) return next()

    this.logger.warn('Blocked admin request from disallowed IP', 'IpAllowlistMiddleware', {
      ip,
      requestId: req.id,
    })
    throw new AppForbiddenException('Access from this network is not allowed.', 'IP_NOT_ALLOWED')
  }

  private normalize(ip: string): string {
    // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
    return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
  }
}
