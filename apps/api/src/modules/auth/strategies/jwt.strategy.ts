import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { JwtPayload } from '@biztrack/types'
import { AuthUsersRepository } from '../repositories/auth-users.repository'
import type { AppConfig } from '@/config/configuration'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig>,
    private usersRepo: AuthUsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersRepo.findOne({ where: { id: payload.sub } })
    if (!user || !user.isActive) throw new UnauthorizedException()
    return payload
  }
}
