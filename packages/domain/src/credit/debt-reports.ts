// ---------------------------------------------------------------------------
// Debt reports (slice 10): the ageing report, the debt summary, a contact's account
// statement, net position and balances, and the contacts list header. The server and the
// till load the debts from their own database and build each report here, so both agree.
// The clock is passed in.
// ---------------------------------------------------------------------------

import {
  ContactStatementEntryType,
  ContactType,
  DebtDirection,
  DebtSource,
  DebtStatus,
  type AgeingEntry,
  type AgeingReport,
  type ContactNetPosition,
  type ContactStatementEntry,
  type ContactsSummary,
  type DebtDirectionSummary,
} from '@biztrack/types'
import { toWholeXaf } from '../money/whole-xaf'
import { daysPastDue, effectiveDueDate } from './credit'
import { debtBalance, debtIsOpen } from './debt-status'

const MS_PER_DAY = 86_400_000

/** A debt as the reports read it: what was owed, what was paid, and its dates. */
export interface ReportDebt {
  contactId: string
  direction: DebtDirection | `${DebtDirection}`
  sourceType: DebtSource | `${DebtSource}`
  originalAmount: number
  /** The sum of every payment recorded against the debt. */
  paidAmount: number
  status: DebtStatus | `${DebtStatus}`
  /** Explicit due date, YYYY-MM-DD, or none. */
  dueDate?: string | null
  createdAt: string | Date
  settledAt?: string | Date | null
}

const toMs = (at: string | Date): number => (at instanceof Date ? at.getTime() : Date.parse(at))
const toIso = (at: string | Date): string => (at instanceof Date ? at.toISOString() : at)
const isOpening = (d: { sourceType: string }) => d.sourceType === DebtSource.OPENING_BALANCE

/** What is still owed on a debt: nothing when it is settled or written off. */
function owed(d: ReportDebt): number {
  return debtIsOpen(d.status) ? debtBalance(d).outstandingAmount : 0
}

// --- Ageing ----------------------------------------------------------------

/** The ageing columns, by days past the effective due date: up to 7, 15, 30, then beyond. */
export const AGEING_BUCKET_DAYS = { current: 7, moderate: 15, aged: 30 } as const

export type AgeingBucket = 'current' | 'moderate' | 'aged' | 'overdue'

/** The ageing column of a debt this many days past its effective due date. */
export function ageingBucket(overdueDays: number): AgeingBucket {
  if (overdueDays <= AGEING_BUCKET_DAYS.current) return 'current'
  if (overdueDays <= AGEING_BUCKET_DAYS.moderate) return 'moderate'
  if (overdueDays <= AGEING_BUCKET_DAYS.aged) return 'aged'
  return 'overdue'
}

type AgeingTotals = AgeingReport['totals']
const emptyAgeing = (): AgeingTotals => ({
  openingBalance: 0,
  current: 0,
  moderate: 0,
  aged: 0,
  overdue: 0,
  pastDue: 0,
  totalOutstanding: 0,
})

/**
 * The ageing report of one direction: each contact's open balance bucketed by how far past
 * its effective due date each debt is (its due date, else created + `creditDays`). The
 * opening balance keeps its own column and is not aged; `pastDue` is what is strictly past
 * due. Contacts with the largest balance first; debts of an unknown contact are left out.
 */
export function buildAgeingReport(input: {
  direction: DebtDirection
  debts: ReadonlyArray<ReportDebt>
  contacts: ReadonlyMap<string, { name: string; phone?: string | null }>
  creditDays: number
  now: Date
}): AgeingReport {
  const byContact = new Map<string, AgeingTotals>()
  for (const debt of input.debts) {
    if (debt.direction !== input.direction || !input.contacts.has(debt.contactId)) continue
    const outstanding = owed(debt)
    if (outstanding <= 0) continue
    const b = byContact.get(debt.contactId) ?? emptyAgeing()
    if (isOpening(debt)) {
      b.openingBalance = toWholeXaf(b.openingBalance + outstanding)
    } else {
      const overdueDays = daysPastDue(
        effectiveDueDate({ dueDate: debt.dueDate, createdAt: debt.createdAt }, input.creditDays),
        input.now,
      )
      const bucket = ageingBucket(overdueDays)
      b[bucket] = toWholeXaf(b[bucket] + outstanding)
      if (overdueDays > 0) b.pastDue = toWholeXaf(b.pastDue + outstanding)
    }
    b.totalOutstanding = toWholeXaf(b.totalOutstanding + outstanding)
    byContact.set(debt.contactId, b)
  }

  const entries: AgeingEntry[] = [...byContact.entries()].map(([contactId, b]) => {
    const contact = input.contacts.get(contactId)!
    return {
      contactId,
      contactName: contact.name,
      contactPhone: contact.phone ?? null,
      ...b,
    }
  })
  entries.sort((a, b) => b.totalOutstanding - a.totalOutstanding)

  const totals = emptyAgeing()
  for (const e of entries) {
    for (const key of Object.keys(totals) as Array<keyof AgeingTotals>) {
      totals[key] = toWholeXaf(totals[key] + e[key])
    }
  }
  return { direction: input.direction, asOf: input.now.toISOString().slice(0, 10), entries, totals }
}

// --- Debt summary ------------------------------------------------------------

/**
 * The debt summary of one direction: what is owed on open debts and how many, the partly
 * paid ones, and the debts settled this calendar month (UTC) with the amount they were for.
 */
export function summarizeDebts(input: {
  direction: DebtDirection
  debts: ReadonlyArray<ReportDebt>
  now: Date
}): DebtDirectionSummary {
  const monthStart = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1)
  const monthEnd = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() + 1, 1)
  const summary: DebtDirectionSummary = {
    direction: input.direction,
    totalOutstanding: 0,
    outstandingDebtCount: 0,
    partiallyPaidDebtCount: 0,
    partiallyPaidOutstanding: 0,
    settledThisMonthCount: 0,
    settledThisMonthAmount: 0,
  }
  for (const debt of input.debts) {
    if (debt.direction !== input.direction) continue
    const outstanding = owed(debt)
    if (outstanding > 0) {
      summary.totalOutstanding = toWholeXaf(summary.totalOutstanding + outstanding)
      summary.outstandingDebtCount += 1
      if (debt.status === DebtStatus.PARTIALLY_PAID) {
        summary.partiallyPaidDebtCount += 1
        summary.partiallyPaidOutstanding = toWholeXaf(
          summary.partiallyPaidOutstanding + outstanding,
        )
      }
    }
    if (debt.status === DebtStatus.SETTLED && debt.settledAt) {
      const at = toMs(debt.settledAt)
      if (at >= monthStart && at < monthEnd) {
        summary.settledThisMonthCount += 1
        summary.settledThisMonthAmount = toWholeXaf(
          summary.settledThisMonthAmount + toWholeXaf(debt.originalAmount),
        )
      }
    }
  }
  return summary
}

// --- Account statement -------------------------------------------------------

export interface StatementDebt extends ReportDebt {
  sourceReference?: string | null
  writtenOffAt?: string | Date | null
  payments: ReadonlyArray<{
    amount: number
    method: string
    mobileMoneyReference?: string | null
    /** YYYY-MM-DD */
    paymentDate: string
    createdAt?: string | Date | null
  }>
}

/** How a debt's own line reads on a statement. */
function debtDescription(sourceType: string): string {
  if (sourceType === DebtSource.OPENING_BALANCE) return 'Opening balance'
  return sourceType === DebtSource.SALE ? 'Sale on credit' : 'Restock on credit'
}

/**
 * A contact's account statement in one direction: each debt (the opening balance first, as
 * it is dated to the opening day), each payment (taken at midday of its date) and what a
 * write-off cancelled, in date order with the running balance.
 */
export function buildContactStatement(input: {
  direction: DebtDirection
  debts: ReadonlyArray<StatementDebt>
}): {
  openingBalance: number
  entries: ContactStatementEntry[]
  closingBalance: number
} {
  const events: Array<{
    sortAt: number
    seq: number
    entry: Omit<ContactStatementEntry, 'balance'>
  }> = []
  const push = (sortAt: number, entry: Omit<ContactStatementEntry, 'balance'>) =>
    events.push({ sortAt, seq: events.length, entry })
  const debts = input.debts
    .filter((d) => d.direction === input.direction)
    .slice()
    .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))

  for (const debt of debts) {
    const opening = isOpening(debt)
    const original = toWholeXaf(debt.originalAmount)
    push(toMs(debt.createdAt), {
      date: toIso(debt.createdAt).slice(0, 10),
      type: opening
        ? ContactStatementEntryType.OPENING_BALANCE
        : ContactStatementEntryType.DEBT_CREATED,
      direction: input.direction,
      reference: opening ? null : (debt.sourceReference ?? null),
      description: debtDescription(debt.sourceType),
      debit: original,
      credit: 0,
    })
    const payments = debt.payments.slice().sort((a, b) => {
      const byDate = a.paymentDate.localeCompare(b.paymentDate)
      if (byDate !== 0) return byDate
      return (a.createdAt ? toMs(a.createdAt) : 0) - (b.createdAt ? toMs(b.createdAt) : 0)
    })
    for (const payment of payments) {
      push(Date.parse(`${payment.paymentDate.slice(0, 10)}T12:00:00.000Z`), {
        date: payment.paymentDate.slice(0, 10),
        type: ContactStatementEntryType.PAYMENT,
        direction: input.direction,
        // The method goes in `reference` (the screen names it), the mobile money reference
        // in `description`.
        reference: payment.method,
        description: payment.mobileMoneyReference ?? '',
        debit: 0,
        credit: toWholeXaf(payment.amount),
      })
    }
    if (debt.status === DebtStatus.WRITTEN_OFF) {
      const cancelled = debtBalance(debt).unpaidAmount
      const at = debt.writtenOffAt ?? debt.settledAt ?? debt.createdAt
      if (cancelled > 0) {
        push(toMs(at), {
          date: toIso(at).slice(0, 10),
          type: ContactStatementEntryType.WRITE_OFF,
          direction: input.direction,
          reference: debt.sourceReference ?? null,
          description: 'Debt written off',
          debit: 0,
          credit: cancelled,
        })
      }
    }
  }

  events.sort((a, b) => a.sortAt - b.sortAt || a.seq - b.seq)
  let balance = 0
  const entries = events.map(({ entry }) => {
    balance = toWholeXaf(balance + entry.debit - entry.credit)
    return { ...entry, balance }
  })
  const opening = debts.find(isOpening)
  return {
    openingBalance: opening ? toWholeXaf(opening.originalAmount) : 0,
    entries,
    closingBalance: balance,
  }
}

// --- Contact balances --------------------------------------------------------

export interface ContactBalance {
  /** What the contact owes on open debts. */
  totalReceivable: number
  /** What is owed to the contact on open debts. */
  totalPayable: number
  /** How many open debts the contact has. */
  openDebts: number
  /** When the oldest open debt was created (ISO), or none. */
  oldestUnpaidAt: string | null
}

/** Each contact's balance from its debts (opening balances are debts, so they are in it). */
export function contactBalances(debts: ReadonlyArray<ReportDebt>): Map<string, ContactBalance> {
  const out = new Map<string, ContactBalance>()
  for (const debt of debts) {
    const b = out.get(debt.contactId) ?? {
      totalReceivable: 0,
      totalPayable: 0,
      openDebts: 0,
      oldestUnpaidAt: null,
    }
    const outstanding = owed(debt)
    if (debt.direction === DebtDirection.RECEIVABLE) {
      b.totalReceivable = toWholeXaf(b.totalReceivable + outstanding)
    } else {
      b.totalPayable = toWholeXaf(b.totalPayable + outstanding)
    }
    if (debtIsOpen(debt.status)) {
      b.openDebts += 1
      const created = toIso(debt.createdAt)
      if (!b.oldestUnpaidAt || toMs(created) < toMs(b.oldestUnpaidAt)) b.oldestUnpaidAt = created
    }
    out.set(debt.contactId, b)
  }
  return out
}

/** A contact's net: what they owe less what is owed to them. */
export function contactNet(b: { totalReceivable: number; totalPayable: number }): number {
  return toWholeXaf(b.totalReceivable - b.totalPayable)
}

/**
 * The contacts list header: balances and counts over the active contacts. A debtor owes
 * something, a creditor is owed something; a contact of type BOTH counts as customer and
 * supplier.
 */
export function contactsSummary(
  contacts: ReadonlyArray<{
    type: ContactType | `${ContactType}`
    isActive: boolean
    totalReceivable: number
    totalPayable: number
  }>,
): ContactsSummary {
  const summary: ContactsSummary = {
    totalReceivable: 0,
    totalPayable: 0,
    allCount: 0,
    customerCount: 0,
    supplierCount: 0,
    debtorCount: 0,
    creditorCount: 0,
  }
  for (const c of contacts) {
    if (!c.isActive) continue
    const r = toWholeXaf(c.totalReceivable)
    const p = toWholeXaf(c.totalPayable)
    summary.allCount += 1
    summary.totalReceivable = toWholeXaf(summary.totalReceivable + r)
    summary.totalPayable = toWholeXaf(summary.totalPayable + p)
    if (r > 0) summary.debtorCount += 1
    if (p > 0) summary.creditorCount += 1
    if (c.type === ContactType.CUSTOMER || c.type === ContactType.BOTH) summary.customerCount += 1
    if (c.type === ContactType.SUPPLIER || c.type === ContactType.BOTH) summary.supplierCount += 1
  }
  return summary
}

/**
 * A contact's net position: per direction, the opening balance and the other debts still
 * owed, what was paid, and their sum; and the net of the two. Written-off debts are left out.
 */
export function contactNetPosition(
  debts: ReadonlyArray<ReportDebt>,
): Omit<ContactNetPosition, 'contact'> {
  const side = () => ({ openingBalance: 0, totalDebts: 0, totalPaid: 0, netBalance: 0 })
  const receivable = side()
  const payable = side()
  for (const debt of debts) {
    if (debt.status === DebtStatus.WRITTEN_OFF) continue
    const balance = debtBalance(debt)
    const s = debt.direction === DebtDirection.RECEIVABLE ? receivable : payable
    if (isOpening(debt)) s.openingBalance = toWholeXaf(s.openingBalance + balance.outstandingAmount)
    else s.totalDebts = toWholeXaf(s.totalDebts + balance.outstandingAmount)
    s.totalPaid = toWholeXaf(s.totalPaid + balance.paidAmount)
  }
  receivable.netBalance = toWholeXaf(receivable.openingBalance + receivable.totalDebts)
  payable.netBalance = toWholeXaf(payable.openingBalance + payable.totalDebts)
  return { receivable, payable, net: toWholeXaf(receivable.netBalance - payable.netBalance) }
}

/** The contacts list colours a balance by the age of its oldest open debt: 30 and 60 days. */
export const CONTACT_AGE_BAND_DAYS = [30, 60] as const

/** Whole days since the contact's oldest open debt, or null without one. */
export function daysUnpaid(
  oldestUnpaidAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (!oldestUnpaidAt) return null
  const t = Date.parse(oldestUnpaidAt)
  return Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / MS_PER_DAY)) : null
}

/** 0 up to 30 days unpaid, 1 up to 60, 2 beyond. */
export function contactAgeBand(days: number): 0 | 1 | 2 {
  const [first, second] = CONTACT_AGE_BAND_DAYS
  return days <= first ? 0 : days <= second ? 1 : 2
}
