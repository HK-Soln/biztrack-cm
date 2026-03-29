import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import type { Logger } from '@biztrack/logger'
import { Inject } from '@nestjs/common'
import { LOGGER } from '@/logger/logger.module'
import type { RequestWithId } from '../http/http-types'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(LOGGER) private logger: Logger) {
    this.logger.setContext('HttpLogger')
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithId>()
    const res = context.switchToHttp().getResponse()
    const startedAt = Date.now()

    const requestId = req?.id ?? 'unknown'
    const method = req?.method
    const url = req?.originalUrl ?? req?.url
    const userId = req?.user?.sub
    const controller = context.getClass().name
    const handler = context.getHandler().name
    const params = req?.params
    const query = req?.query
    const body = this.redactBody(req?.body)

    this.logger.log('HTTP request received', 'HttpLogger', {
      requestId,
      method,
      url,
      userId,
      controller,
      handler,
      params,
      query,
      body,
    })

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startedAt
          const statusCode = res?.statusCode
          this.logger.log('HTTP response sent', 'HttpLogger', {
            requestId,
            method,
            url,
            statusCode,
            durationMs,
            userId,
            controller,
            handler,
          })
        },
        error: (err) => {
          const durationMs = Date.now() - startedAt
          const statusCode = err?.status ?? err?.statusCode ?? res?.statusCode
          this.logger.error('HTTP error response', 'HttpLogger', {
            requestId,
            method,
            url,
            statusCode,
            durationMs,
            userId,
            controller,
            handler,
            message: err?.message,
          })
        },
      }),
    )
  }

  private redactBody(body: unknown) {
    if (!body || typeof body !== 'object') return body
    const clone = Array.isArray(body) ? [...body] : { ...(body as Record<string, unknown>) }
    const redactKeys = ['password', 'token', 'refreshToken', 'accessToken', 'code', 'otp']
    for (const key of redactKeys) {
      if (key in (clone as Record<string, unknown>)) {
        ;(clone as Record<string, unknown>)[key] = '***'
      }
    }
    return clone
  }
}
