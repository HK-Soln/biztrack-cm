import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '@/config/configuration'
import type { AdminJwtPayload } from '../auth/admin-jwt-payload'

export const ADMIN_JWT_STRATEGY = 'admin-jwt'

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, ADMIN_JWT_STRATEGY) {
  constructor(config: ConfigService<AppConfig>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('ADMIN_JWT_ACCESS_SECRET', { infer: true }),
    })
  }

  /**
   * Permissions are embedded in the token, so we deliberately do NOT hit the DB
   * here — authorization stays a fast, in-memory check. Role/permission changes
   * propagate on the next token refresh (≤ access-token TTL).
   */
  validate(payload: AdminJwtPayload): AdminJwtPayload {
    return payload
  }
}
