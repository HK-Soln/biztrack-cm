import { normalizeEmail, normalizePhone } from '../contacts/contact-rules'

/**
 * Ruling R20: an online buyer is not a contact. The shop keeps a list of online customers,
 * one per person, recognised on their next order by phone or email. Names need not be
 * unique there; a buyer becomes a contact only when the shop adds them (ruling R16).
 */

/** How a buyer is recognised: phone in international form, email in lower case. */
export function onlineBuyerKeys(buyer: { phone?: string | null; email?: string | null }): {
  phone: string | null
  email: string | null
} {
  return {
    // A number that cannot be read as a phone is kept as typed, so the same text still matches.
    phone: normalizePhone(buyer.phone) ?? (buyer.phone?.trim() || null),
    email: normalizeEmail(buyer.email),
  }
}

/**
 * The known online customer a buyer is, matched by phone first, then by email; null for a
 * first-time buyer. `customers` hold keys as `onlineBuyerKeys` returns them.
 */
export function findOnlineCustomer<
  C extends { id: string; phone?: string | null; email?: string | null },
>(buyer: { phone?: string | null; email?: string | null }, customers: ReadonlyArray<C>): C | null {
  const keys = onlineBuyerKeys(buyer)
  if (keys.phone) {
    const byPhone = customers.find((customer) => customer.phone === keys.phone)
    if (byPhone) return byPhone
  }
  if (keys.email) {
    const byEmail = customers.find((customer) => customer.email === keys.email)
    if (byEmail) return byEmail
  }
  return null
}
