import { Inject, Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction } from 'express'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { RequestWithId, ResponseWithId } from '../http/http-types'

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(@Inject(LOGGER) private logger: Logger) {
    this.logger.setContext('HttpRequest')
  }

  use(req: RequestWithId, res: ResponseWithId, next: NextFunction) {
    const requestId = req.id ?? 'unknown'
    const method = req.method
    const url = req.originalUrl ?? req.url

    this.logger.log('HTTP request received (middleware)', 'HttpRequest', {
      requestId,
      method,
      url,
    })

    next()
  }
}
