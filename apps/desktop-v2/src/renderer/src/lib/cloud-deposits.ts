import type {
  LocalSavingsBalance,
  CustomerDeposit,
  LocalDepositDetail,
  LocalDepositSummary,
  DepositStatement,
  DepositsListQuery,
  CreateDepositInput,
  AddDepositPaymentInput,
  CloseDepositInput,
  PaginatedResult,
} from '@shared/ipc'
import type { DepositReceipt, DepositReport } from '@biztrack/types'
import {
  renderDepositReceiptHtml,
  depositReceiptLabels,
  renderDepositReportHtml,
  depositReportLabels,
} from '@biztrack/templates'
import { cget, cpost } from './cloud-http'

function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out
}

/**
 * Cloud (browser) read adapters for customer deposits (the savings module is mounted at
 * `@Controller('deposits')`). `CustomerDeposit` + `DepositStatement` are shared types
 * (passthrough). Writes (create/addPayment/close) hit the deposits endpoints; the
 * receipt/report HTML renders from the API's structured payload via @biztrack/templates.
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

export const cloudSavings = {
  getForCustomer: async (customerId: string): Promise<LocalSavingsBalance | null> => {
    const d = await cget<CustomerDeposit | null>(`/deposits/open/${customerId}`)
    return d ? { id: d.id, accountNumber: d.accountNumber, balance: d.balance } : null
  },
}

export const cloudDeposits = {
  list: (query?: DepositsListQuery): Promise<PaginatedResult<CustomerDeposit>> =>
    cget<PaginatedResult<CustomerDeposit>>(`/deposits${qs(query as Record<string, unknown>)}`),
  get: async (id: string): Promise<LocalDepositDetail | null> => {
    try {
      // The detail entity has no nested ledger; the timeline lives in the statement.
      const [d, stmt] = await Promise.all([
        cget<CustomerDeposit>(`/deposits/${id}`),
        cget<DepositStatement>(`/deposits/${id}/statement`).catch(() => null),
      ])
      const transactions = (stmt?.entries ?? []).map((e) => ({
        id: e.id,
        savingsId: id,
        businessId: d.businessId,
        type: e.type,
        direction: e.direction,
        amount: e.amount,
        method: e.method ?? null,
        mobileMoneyReference: e.mobileMoneyReference ?? null,
        saleId: e.saleId ?? null,
        notes: e.notes ?? null,
        recordedById: null,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      }))
      return { ...d, transactions }
    } catch {
      return null
    }
  },
  statement: async (id: string): Promise<DepositStatement | null> => {
    try {
      return await cget<DepositStatement>(`/deposits/${id}/statement`)
    } catch {
      return null
    }
  },
  summary: (): Promise<LocalDepositSummary> => cget<LocalDepositSummary>('/deposits/summary'),
  create: (input: CreateDepositInput): Promise<CustomerDeposit> =>
    cpost<CustomerDeposit>(
      '/deposits',
      clean({ customerId: input.customerId, taggedProducts: input.taggedProducts, initialDeposit: input.initialDeposit }),
    ),
  addPayment: (id: string, input: AddDepositPaymentInput): Promise<CustomerDeposit> =>
    cpost<CustomerDeposit>(`/deposits/${id}/payments`, clean({ ...input })),
  close: (id: string, input: CloseDepositInput): Promise<CustomerDeposit> =>
    cpost<CustomerDeposit>(`/deposits/${id}/close`, clean({ ...input })),
  // Render the receipt/report HTML from the API's structured payload + shared templates
  // (the same templates the desktop uses); the share dialog prints/PDFs from this.
  receiptHtml: async (transactionId: string, locale: string): Promise<string | null> => {
    try {
      const receipt = await cget<DepositReceipt>(`/deposits/transactions/${transactionId}/receipt`)
      return renderDepositReceiptHtml(receipt, { labels: depositReceiptLabels(locale), locale })
    } catch {
      return null
    }
  },
  reportHtml: async (id: string, locale: string): Promise<string | null> => {
    try {
      const report = await cget<DepositReport>(`/deposits/${id}/report`)
      return renderDepositReportHtml(report, { labels: depositReportLabels(locale), locale })
    } catch {
      return null
    }
  },
}
