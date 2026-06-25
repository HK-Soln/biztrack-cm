import { HttpException, HttpStatus } from '@nestjs/common'

export class AppException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly code: string = 'APP_ERROR',
    public readonly details?: unknown,
  ) {
    super(message, status)
  }
}

export class AppUnauthorizedException extends AppException {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED', details?: unknown) {
    super(message, HttpStatus.UNAUTHORIZED, code, details)
  }
}

export class AppForbiddenException extends AppException {
  constructor(message = 'Forbidden', code = 'FORBIDDEN', details?: unknown) {
    super(message, HttpStatus.FORBIDDEN, code, details)
  }
}

export class AppNotFoundException extends AppException {
  constructor(message = 'Not found', code = 'NOT_FOUND', details?: unknown) {
    super(message, HttpStatus.NOT_FOUND, code, details)
  }
}

export class AppConflictException extends AppException {
  constructor(message = 'Conflict', code = 'CONFLICT', details?: unknown) {
    super(message, HttpStatus.CONFLICT, code, details)
  }
}
