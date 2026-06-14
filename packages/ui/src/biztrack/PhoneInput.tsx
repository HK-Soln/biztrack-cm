// @ts-ignore — package ships its own CSS without types
import 'react-phone-number-input/style.css'
import { forwardRef } from 'react'
import type { ComponentType } from 'react'
import PhoneInputBase, { isValidPhoneNumber, type Country } from 'react-phone-number-input'
import { clsx } from 'clsx'

export interface PhoneInputProps {
  value?: string
  onChange?: (value?: string) => void
  defaultCountry?: string
  placeholder?: string
  error?: boolean
  disabled?: boolean
  id?: string
}

// Design-system phone input (wraps react-phone-number-input). Returns an E.164
// string via onChange. Styled by .phone-field in @biztrack/ui/styles.css.
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, defaultCountry = 'CM', placeholder, error, disabled, id },
  ref,
) {
  const Base = PhoneInputBase as unknown as ComponentType<Record<string, unknown>>
  return (
    <div className={clsx('phone-field', error && 'err')}>
      <Base
        ref={ref}
        id={id}
        international
        defaultCountry={defaultCountry as Country}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
})

/** True when the given E.164 string is a valid phone number. */
export function isValidPhone(value: string | undefined): boolean {
  return !!value && isValidPhoneNumber(value)
}
