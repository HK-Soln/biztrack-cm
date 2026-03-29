import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { NextFunction } from 'express'
import type { RequestWithId, ResponseWithId } from '../http/http-types'

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: ResponseWithId, next: NextFunction) {
    const incoming = req.headers['x-request-id']
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID()

    req.id = requestId
    res.setHeader('x-request-id', requestId)

    next()
  }
}
