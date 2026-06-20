import type { ListQuery, IsoDateString, PaginatedResult } from './http.types'
import type { PaymentMethod } from './sale.types'
import type { ProductUserSummary } from './product.types'

export enum ContactType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
  BOTH = 'BOTH',
}

/** Kind of identification document captured for a contact (KYC). */
export enum IdDocumentType {
  ID_CARD = 'ID_CARD',
  PASSPORT = 'PASSPORT',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  RESIDENCE_PERMIT = 'RESIDENCE_PERMIT',
  OTHER = 'OTHER',
}

export enum DebtDirection {
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
}

export enum DebtSource {
  SALE = 'SALE',
  RESTOCK = 'RESTOCK',
  OPENING_BALANCE = 'OPENING_BALANCE',
}

export enum DebtStatus {
  OUTSTANDING = 'OUTSTANDING',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  SETTLED = 'SETTLED',
  WRITTEN_OFF = 'WRITTEN_OFF',
}

export enum ContactStatementEntryType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  DEBT_CREATED = 'DEBT_CREATED',
  PAYMENT = 'PAYMENT',
  WRITE_OFF = 'WRITE_OFF',
}

export interface ContactUserSummary extends ProductUserSummary {}

export interface Contact {
  id: string
  businessId: string
  type: ContactType
  name: string
  phone?: string | null
  phoneAlt?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  /** Optional KYC / identification (mainly for customers on credit). */
  idType?: IdDocumentType | null
  idNumber?: string | null
  idIssueDate?: IsoDateString | null
  idExpiryDate?: IsoDateString | null
  /** Uploaded ID document files (PDF/image URLs). */
  idDocuments?: string[] | null
  /** Optional customer selfie photo (image URL). */
  selfieUrl?: string | null
  isActive: boolean
  createdById: string
  createdBy?: ContactUserSummary | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface ContactListItem extends Contact {
  totalReceivable: number
  totalPayable: number
  openDebts: number
  lastTransactionDate?: string | null
  /** Created date of the oldest still-open debt (age-of-debt indicator). */
  oldestUnpaidAt?: string | null
}

export interface ContactDetail extends ContactListItem {}

export interface ContactListResult extends PaginatedResult<ContactListItem> {}

export interface DebtContactSummary {
  id: string
  type: ContactType
  name: string
  phone?: string | null
}

export interface DebtPaymentRecordedBySummary extends ProductUserSummary {}

export interface DebtPayment {
  id: string
  businessId: string
  debtId: string
  amount: number
  method: PaymentMethod
  mobileMoneyReference?: string | null
  paymentDate: string
  notes?: string | null
  recordedById: string
  recordedBy?: DebtPaymentRecordedBySummary | null
  createdAt: IsoDateString
}

export interface Debt {
  id: string
  businessId: string
  contactId: string
  contact?: DebtContactSummary | null
  direction: DebtDirection
  sourceType: DebtSource
  sourceId: string
  sourceReference: string
  originalAmount: number
  paidAmount: number
  outstandingAmount: number
  status: DebtStatus
  dueDate?: string | null
  notes?: string | null
  createdAt: IsoDateString
  settledAt?: IsoDateString | null
  writtenOffAt?: IsoDateString | null
  writtenOffById?: string | null
  writtenOffReason?: string | null
  payments?: DebtPayment[]
}

export interface DebtListItem extends Debt {}

export interface DebtListResult extends PaginatedResult<DebtListItem> {}

export interface DebtDirectionSummary {
  direction: DebtDirection
  totalOutstanding: number
  outstandingDebtCount: number
  partiallyPaidDebtCount: number
  partiallyPaidOutstanding: number
  settledThisMonthCount: number
  settledThisMonthAmount: number
}

export interface ContactStatementEntry {
  date: string
  type: ContactStatementEntryType
  direction: DebtDirection
  reference?: string | null
  description: string
  debit: number
  credit: number
  balance: number
}

export interface ContactStatement {
  contact: {
    id: string
    name: string
    phone?: string | null
  }
  direction: DebtDirection
  openingBalance: number
  entries: ContactStatementEntry[]
  closingBalance: number
}

export interface ContactOpeningBalance {
  id: string
  contactId: string
  businessId: string
  direction: DebtDirection
  amount: number
  asOfDate: string
  notes?: string | null
  recordedById?: string | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface UpsertOpeningBalanceRequest {
  direction: DebtDirection
  amount: number
  asOfDate: string
  notes?: string
}

export interface ContactNetPosition {
  contact: { id: string; name: string; phone?: string | null }
  receivable: {
    openingBalance: number
    totalDebts: number
    totalPaid: number
    netBalance: number
  }
  payable: {
    openingBalance: number
    totalDebts: number
    totalPaid: number
    netBalance: number
  }
  net: number
}

export interface AgeingEntry {
  contactId: string
  contactName: string
  contactPhone?: string | null
  openingBalance: number
  current: number
  moderate: number
  aged: number
  overdue: number
  totalOutstanding: number
}

export interface AgeingReport {
  direction: DebtDirection
  asOf: string
  entries: AgeingEntry[]
  totals: Omit<AgeingEntry, 'contactId' | 'contactName' | 'contactPhone'>
}

export interface ContactsQuery extends ListQuery {
  type?: ContactType
  isActive?: boolean
  /** Filter to contacts with an outstanding balance in one direction. */
  balance?: 'debtor' | 'creditor'
}

/** Aggregate balances + per-tab counts for the contacts list header. */
export interface ContactsSummary {
  totalReceivable: number
  totalPayable: number
  allCount: number
  customerCount: number
  supplierCount: number
  debtorCount: number
  creditorCount: number
}

export interface DebtsQuery extends ListQuery {
  status?: DebtStatus
  contactId?: string
  dateFrom?: string
  dateTo?: string
}

export interface ContactStatementQuery {
  direction?: DebtDirection
}

export interface CreateContactRequest {
  type: ContactType
  name: string
  phone?: string
  phoneAlt?: string
  email?: string
  address?: string
  notes?: string
  idType?: IdDocumentType | null
  idNumber?: string | null
  idIssueDate?: string | null
  idExpiryDate?: string | null
  idDocuments?: string[] | null
  selfieUrl?: string | null
}

export interface UpdateContactRequest extends Partial<CreateContactRequest> {}

export interface RecordDebtPaymentRequest {
  amount: number
  method: PaymentMethod
  paymentDate: string
  mobileMoneyReference?: string
  notes?: string
}

export interface WriteOffDebtRequest {
  reason: string
}
