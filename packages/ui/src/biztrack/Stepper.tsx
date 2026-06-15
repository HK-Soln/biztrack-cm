'use client'

import type { ReactNode } from 'react'

export interface StepperStep {
  /** Stable key for the step. */
  key: string
  /** Short label shown under the dot. */
  label: string
  /** Optional secondary line (e.g. a summary of entered data). */
  hint?: ReactNode
}

export interface StepperProps {
  steps: StepperStep[]
  /** Index of the active step. */
  current: number
  /** Highest step the user has reached (controls which dots are clickable). */
  maxReached?: number
  /** Click a completed/reached step to jump back to it. */
  onStepClick?: (index: number) => void
  className?: string
}

/**
 * Horizontal numbered stepper for multi-step forms. Purely presentational —
 * the host owns step state, validation and navigation. Reached steps are
 * clickable (jump back); upcoming steps are inert.
 */
export function Stepper({ steps, current, maxReached, onStepClick, className }: StepperProps) {
  const reached = maxReached ?? current
  return (
    <ol className={`bt-stepper${className ? ` ${className}` : ''}`}>
      {steps.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming'
        const clickable = onStepClick != null && i <= reached && i !== current
        return (
          <li key={step.key} className={`bt-stepper-item is-${state}`} aria-current={i === current ? 'step' : undefined}>
            <button
              type="button"
              className="bt-stepper-btn"
              onClick={clickable ? () => onStepClick?.(i) : undefined}
              disabled={!clickable}
            >
              <span className="bt-stepper-dot">
                {state === 'done' ? (
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 8 3.5 3.5L13 5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="bt-stepper-text">
                <span className="bt-stepper-label">{step.label}</span>
                {step.hint ? <span className="bt-stepper-hint">{step.hint}</span> : null}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
