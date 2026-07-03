import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common'
import { Observable, map } from 'rxjs'
import type { ApiResponse } from '@biztrack/types'
import type { RequestWithId } from '../http/http-types'

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const req = context.switchToHttp().getRequest<RequestWithId>()
    const requestId = req?.id ?? 'unknown'

    return next.handle().pipe(
      map((data) => {
        // Binary streams (PDF downloads) must pass through untouched — never enveloped.
        if (data instanceof StreamableFile) {
          return data as unknown as ApiResponse<T>
        }

        if (data && typeof data === 'object' && 'success' in (data as object) && 'requestId' in (data as object) && 'timestamp' in (data as object)) {
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
