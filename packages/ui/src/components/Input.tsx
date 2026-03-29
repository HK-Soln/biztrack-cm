import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder-gray-400
            focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500
            ${error ? 'border-red-300 text-red-900' : 'border-gray-300 text-gray-900'}
            disabled:bg-gray-50 disabled:cursor-not-allowed
            ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
