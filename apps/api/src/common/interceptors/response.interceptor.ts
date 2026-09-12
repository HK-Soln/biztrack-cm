import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, map } from 'rxjs'
import type { ApiResponse } from '@biztrack/types'
import type { RequestWithId } from '../http/http-types'
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator'

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const req = context.switchToHttp().getRequest<RequestWithId>()
    const requestId = req?.id ?? 'unknown'

    // Handlers marked @RawResponse() (e.g. payment webhooks needing an exact literal ack body) are
    // sent verbatim — never enveloped.
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (raw) {
      return next.handle() as unknown as Observable<ApiResponse<T>>
    }

    return next.handle().pipe(
      map((data) => {
        // Binary streams (PDF downloads) must pass through untouched — never enveloped.
        if (data instanceof StreamableFile) {
          return data as unknown as ApiResponse<T>
        }

        if (
          data &&
          typeof data === 'object' &&
          'success' in (data as object) &&
          'requestId' in (data as object) &&
          'timestamp' in (data as object)
        ) {
          return data as unknown as ApiResponse<T>
        }

        return {
          success: true,
          data,
          requestId,
          timestamp: new Date().toISOString(),
        }
      }),
    )
  }
}
