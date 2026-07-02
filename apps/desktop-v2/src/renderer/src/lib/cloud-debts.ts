import type {
  LocalDebt,
  ContactStatement,
  LocalOpeningBalance,
  DebtsQuery,
  DebtDirection,
  RecordDebtPaymentRequest,
  OpeningBalanceInput,
  PaginatedResult,
  AgeingReport,
} from '@shared/ipc'
import { DebtDirection as DebtDirectionEnum } from '@biztrack/types'
import { cget, cpost } from './cloud-http'

/**
 * Cloud (browser) read adapters for a contact's credit sub-resources (debts + statement
 * + opening balances), served by the API contacts controller. `ContactStatement` is a
 * shared type (passthrough); the debt list item is a `LocalDebt` superset. Writes
 * (recordPayment/offset/upsert) map to the contacts/creditors/debtors endpoints.
 */


function qs(query?: Record<string, unknown>): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

type ApiDebt = LocalDebt & { businessId?: string }
function toLocalDebt(d: ApiDebt): LocalDebt {
  return {
    id: d.id,
    contactId: d.contactId,
    direction: d.direction,
    sourceType: d.sourceType,
    sourceReference: d.sourceReference,
    originalAmount: d.originalAmount,
    paidAmount: d.paidAmount,
    outstandingAmount: d.outstandingAmount,
    status: d.status,
    dueDate: d.dueDate ?? null,
    notes: d.notes ?? null,
    createdAt: d.createdAt,
    settledAt: d.settledAt ?? null,
  }
}

interface ApiOpeningBalance {
  id: string
  contactId: string
  direction: DebtDirection
  amount: number
  asOfDate: string
  notes?: string | null
  createdAt: string
  updatedAt: string
}
function toLocalOpeningBalance(o: ApiOpeningBalance): LocalOpeningBalance {
  return {
    id: o.id,
    contactId: o.contactId,
    direction: o.direction,
    amount: o.amount,
    asOfDate: o.asOfDate,
    notes: o.notes ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}

export const cloudDebts = {
  listByContact: async (contactId: string, query?: DebtsQuery): Promise<PaginatedResult<LocalDebt>> => {
    const res = await cget<PaginatedResult<ApiDebt>>(
      `/contacts/${contactId}/debts${qs(query as Record<string, unknown>)}`,
    )
    return { ...res, data: res.data.map(toLocalDebt) }
  },
  statement: (contactId: string, direction: DebtDirection): Promise<ContactStatement> =>
    cget<ContactStatement>(`/contacts/${contactId}/statement?direction=${direction}`),
  // The payment routes are nested per direction (/debtors|/creditors/:debtId/payments)
  // and the input has no direction — try debtors first, fall back to creditors.
  recordPayment: async (debtId: string, input: RecordDebtPaymentRequest): Promise<LocalDebt> => {
    const body = { ...input }
    try {
      return toLocalDebt(await cpost<ApiDebt>(`/debtors/${debtId}/payments`, body))
    } catch {
      return toLocalDebt(await cpost<ApiDebt>(`/creditors/${debtId}/payments`, body))
    }
  },
  offset: (contactId: string): Promise<{ offsetAmount: number; affected: number }> =>
    cpost<{ offsetAmount: number; affected: number }>(`/contacts/${contactId}/offset`, {}),
  // Ageing lives on the direction-scoped controllers: /debtors/ageing (receivable) and
  // /creditors/ageing (payable). Both return the shared AgeingReport.
  ageing: (direction: DebtDirection): Promise<AgeingReport> =>
    cget<AgeingReport>(direction === DebtDirectionEnum.RECEIVABLE ? '/debtors/ageing' : '/creditors/ageing'),
}

export const cloudOpeningBalances = {
  listForContact: async (contactId: string): Promise<LocalOpeningBalance[]> =>
    (await cget<ApiOpeningBalance[]>(`/contacts/${contactId}/opening-balance`)).map(toLocalOpeningBalance),
  upsert: async (input: OpeningBalanceInput): Promise<LocalOpeningBalance> => {
    const body: Record<string, unknown> = { direction: input.direction, amount: input.amount }
    if (input.asOfDate != null) body.asOfDate = input.asOfDate
    if (input.notes != null) body.notes = input.notes
    return toLocalOpeningBalance(
      await cpost<ApiOpeningBalance>(`/contacts/${input.contactId}/opening-balance`, body),
    )
  },
}
