import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common'
import type { Response } from 'express'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import type { RequestWithId } from '../http/http-types'
import { AppException } from '../exceptions/app.exception'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private logger: Logger) {
    this.logger.setContext('HttpExceptionFilter')
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<RequestWithId>()
    const res = ctx.getResponse<Response>()
    const requestId = req?.id ?? 'unknown'

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let code = 'INTERNAL_SERVER_ERROR'
    let details: unknown = undefined

    if (exception instanceof AppException) {
      status = exception.getStatus()
      message = exception.message
      code = exception.code
      details = exception.details
    } else if (exception instanceof HttpException) {
      status = exception.getStatus()
      const response = exception.getResponse()
      if (typeof response === 'string') {
        message = response
      } else if (typeof response === 'object' && response) {
        const payload = response as Record<string, unknown>
        const msg = payload.message
        message = Array.isArray(msg) ? msg.join(', ') : (msg as string) ?? exception.message
        details = payload
      } else {
        message = exception.message
      }
      code = `HTTP_${status}`
    } else if (exception instanceof Error) {
      message = exception.message
    }

    this.logger.error('Unhandled exception', 'HttpExceptionFilter', {
      requestId,
      status,
      code,
      message,
    })

    res.status(status).json({
      success: false,
      message,
      error: { code, details },
      requestId,
      timestamp: new Date().toISOString(),
    })
  }
}
