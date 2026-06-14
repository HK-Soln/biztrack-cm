import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'

export interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  error?: boolean
  autoFocus?: boolean
}

// Design-system OTP input: N boxes with auto-advance, backspace, and paste.
// Styled by .otp in @biztrack/ui/styles.css.
export function OtpInput({ length = 6, value, onChange, onComplete, error, autoFocus = true }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  const cells = Array.from({ length }, (_, i) => value[i] ?? '')

  const setAt = (i: number, digit: string) => {
    const next = cells.slice()
    next[i] = digit
    const joined = next.join('')
    onChange(joined)
    if (digit && i < length - 1) refs.current[i + 1]?.focus()
    if (joined.length === length && next.every(Boolean)) onComplete?.(joined)
  }

  return (
    <div className={clsx('otp', error && 'err')}>
      {cells.map((ch, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          inputMode="numeric"
          maxLength={1}
          value={ch}
          className={ch ? 'filled' : ''}
          onChange={(e) => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !cells[i] && i > 0) refs.current[i - 1]?.focus()
          }}
          onPaste={(e) => {
            e.preventDefault()
            const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
            if (!digits) return
            onChange(digits)
            const last = Math.min(digits.length, length) - 1
            refs.current[last >= 0 ? last : 0]?.focus()
            if (digits.length === length) onComplete?.(digits)
          }}
        />
      ))}
    </div>
  )
}
