'use client'
import React, { useState } from 'react'
import { cn } from '../lib/utils'

export interface InputPasswordProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  hint?: string
}

export const InputPassword = React.forwardRef<HTMLInputElement, InputPasswordProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    const [visible, setVisible] = useState(false)

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={cn(
              'block w-full rounded-lg border bg-background px-3 py-2 pr-10 text-sm text-foreground shadow-sm placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring',
              'disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
              error ? 'border-destructive text-destructive' : 'border-input',
              className,
            )}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
          >
            {visible ? (
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" />
                <circle cx="10" cy="10" r="2.5" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" />
                <circle cx="10" cy="10" r="2.5" />
                <path d="m3 3 14 14" />
              </svg>
            )}
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    )
  },
)

InputPassword.displayName = 'InputPassword'
