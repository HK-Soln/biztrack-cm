import { describe, expect, it } from 'vitest'
import { daysPastDue, effectiveDueDate } from './credit'

describe('effectiveDueDate', () => {
  it('uses the explicit due date when present', () => {
    const due = effectiveDueDate(
      { dueDate: '2026-09-01', createdAt: new Date('2026-08-01T10:00:00Z') },
      30,
    )
    expect(due.toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('falls back to createdAt + creditDays when no due date', () => {
    const due = effectiveDueDate({ createdAt: new Date('2026-08-01T00:00:00Z') }, 30)
    expect(due.toISOString().slice(0, 10)).toBe('2026-08-31')
  })

  it('accepts a string createdAt', () => {
    const due = effectiveDueDate({ createdAt: '2026-08-01T00:00:00.000Z' }, 15)
    expect(due.toISOString().slice(0, 10)).toBe('2026-08-16')
  })

  it('treats a negative credit period as 0 days', () => {
    const due = effectiveDueDate({ createdAt: new Date('2026-08-01T00:00:00Z') }, -5)
    expect(due.toISOString().slice(0, 10)).toBe('2026-08-01')
  })
})

describe('daysPastDue', () => {
  const now = new Date('2026-08-20T12:00:00Z')

  it('is positive when overdue', () => {
    expect(daysPastDue(new Date('2026-08-10T12:00:00Z'), now)).toBe(10)
  })

  it('is negative when not yet due', () => {
    expect(daysPastDue(new Date('2026-08-25T12:00:00Z'), now)).toBe(-5)
  })

  it('is 0 on the due day', () => {
    expect(daysPastDue(new Date('2026-08-20T00:00:00Z'), now)).toBe(0)
  })
})
