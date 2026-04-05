import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { ValidationError } from 'class-validator'

export function createI18nValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) => {
      const fields = errors.map((err) => ({
        field: err.property,
        errors: Object.values(err.constraints ?? {}),
      }))

      return new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'i18n:errors.validation_failed',
        context: { fields },
      })
    },
  })
}
