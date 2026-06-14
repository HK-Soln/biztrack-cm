import {
  isEmail,
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator'
import { isValidPhoneNumber } from 'libphonenumber-js'

/** True when the value is a valid email OR a valid international phone number. */
export function isValidIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v) return false
  return isEmail(v) || isValidPhoneNumber(v)
}

@ValidatorConstraint({ name: 'isIdentifier', async: false })
export class IsIdentifierConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidIdentifier(value)
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid email address or phone number`
  }
}

/** DTO decorator: the field must be a valid email or a valid (any-country) phone. */
export function IsIdentifier(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsIdentifierConstraint,
    })
  }
}

@ValidatorConstraint({ name: 'isValidPhone', async: false })
export class IsValidPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidPhoneNumber(value.trim())
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid phone number (include the country code, e.g. +237…)`
  }
}

/** DTO decorator: a valid international phone number (any country). */
export function IsValidPhone(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsValidPhoneConstraint,
    })
  }
}
