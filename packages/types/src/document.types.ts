// Shared primitives for printable/shareable documents (purchase orders, RFQs,
// later invoices/receipts). These are *view models*: fully-resolved data the
// template renders, independent of how each app loaded it. Both the API and the
// desktop app build these and pass them to @biztrack/templates so the output is
// identical everywhere.

export interface DocumentBusinessInfo {
  name: string
  logoUrl?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

export interface DocumentParty {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
}

/** ISO 4217 currency code + optional BCP-47 locale (defaults to 'fr'). */
export interface DocumentMoneyContext {
  currency: string
  locale?: string
}

/** Channels a procurement document (RFQ/PO) can be sent through. */
export type DocumentSendChannel = 'email' | 'whatsapp'

/** Explicit recipient override used when the supplier contact has no stored
 * email/phone for the chosen channel (the user is prompted for it). */
export interface DocumentRecipient {
  email?: string
  phone?: string
}
