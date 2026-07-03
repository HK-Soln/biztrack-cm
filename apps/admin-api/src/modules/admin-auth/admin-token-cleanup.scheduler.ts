import { Inject, Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AdminRefreshTokensRepository } from './repositories/admin-refresh-tokens.repository'

/**
 * Admin sessions are short-lived (8h), so consumed/revoked refresh tokens pile up
 * fast. Prune expired-and-consumed rows daily. (The client API lacks this; admin adds it.)
 */
@Injectable()
export class AdminTokenCleanupScheduler {
  constructor(
    private readonly refreshTokensRepo: AdminRefreshTokensRepository,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'admin-token-cleanup' })
  async cleanup() {
    const result = await this.refreshTokensRepo.deleteExpiredConsumed()
    this.logger.log('Pruned expired admin refresh tokens', 'AdminTokenCleanupScheduler', {
      affected: result.affected ?? 0,
    })
  }
}
