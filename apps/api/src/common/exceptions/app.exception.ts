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
