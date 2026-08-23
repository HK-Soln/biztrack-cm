// Credit-terms date math (D9). A debt's effective due date is its explicit `dueDate`,
// or `createdAt + defaultCreditDays` when none was set. This is the single basis shared
// by the ageing report and the debt-due reminder producer, so both agree on "overdue".

const MS_PER_DAY = 86_400_000

export interface DueDateInput {
  /** Explicit due date, 'YYYY-MM-DD' (or null when the debt carries none). */
  dueDate?: string | null
  /** When the debt was created. */
  createdAt: Date | string
}

/** The date a debt is effectively due: its `dueDate`, else `createdAt + creditDays`. */
export function effectiveDueDate(debt: DueDateInput, creditDays: number): Date {
  if (debt.dueDate) return new Date(`${debt.dueDate}T00:00:00.000Z`)
  const created = typeof debt.createdAt === 'string' ? new Date(debt.createdAt) : debt.createdAt
  return new Date(created.getTime() + Math.max(0, creditDays) * MS_PER_DAY)
}

/** Whole days `now` is past `due` — negative when the debt is not yet due. */
export function daysPastDue(due: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - due.getTime()) / MS_PER_DAY)
}
