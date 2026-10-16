// ---------------------------------------------------------------------------
// Contacts (ruling R16). Only the name is required, and it is unique in the business by
// its slug. A phone number is optional and, when given, a valid number from any country.
// A new contact whose phone or email is already on another one is refused by default;
// the person creating it then chooses to merge into that contact, create it anyway, or
// cancel. One rule for the server (REST and sync), the till and the screens.
// ---------------------------------------------------------------------------

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import { ContactType } from '@biztrack/types'
import { slugify } from '../text/slug'

/** The key a contact's name is unique by in its business. */
export function contactNameKey(name: string): string {
  return slugify(name, 200)
}

/** Where a number written without its country code is taken to be. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'CM'

/**
 * A phone number as stored: international form (+237…). A number without its country code
 * is read as a Cameroon number. Null when blank or not a valid number.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  const value = raw?.trim()
  if (!value) return null
  const parsed = parsePhoneNumberFromString(value, defaultCountry)
  return parsed && parsed.isValid() ? parsed.number : null
}

/** An email as compared and stored: trimmed, lower case; null when blank. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase()
  return value ? value : null
}

export type ContactInputRejection =
  | 'CONTACT_NAME_REQUIRED'
  | 'CONTACT_PHONE_INVALID'
  | 'CONTACT_EMAIL_INVALID'

/** Whether an email address is written as one: something@domain.tld, no spaces. */
export function isValidEmail(raw: string | null | undefined): boolean {
  const value = raw?.trim()
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * A contact as entered: a name, phone numbers that are valid when given, and an email
 * written as one when given.
 */
export function checkContactInput(input: {
  name?: string | null
  phone?: string | null
  phoneAlt?: string | null
  email?: string | null
}): ContactInputRejection | null {
  if (!input.name?.trim() || !contactNameKey(input.name)) return 'CONTACT_NAME_REQUIRED'
  for (const phone of [input.phone, input.phoneAlt]) {
    if (phone?.trim() && !normalizePhone(phone)) return 'CONTACT_PHONE_INVALID'
  }
  if (input.email?.trim() && !isValidEmail(input.email)) return 'CONTACT_EMAIL_INVALID'
  return null
}

/**
 * Archiving a contact: one who still owes or is owed (an open debt) cannot be archived.
 * Only checked when the contact goes from active to archived.
 */
export function checkContactArchive(input: {
  wasActive: boolean
  isActive: boolean
  hasOpenDebts: boolean
}): 'CONTACT_HAS_OPEN_DEBTS' | null {
  return input.wasActive && !input.isActive && input.hasOpenDebts ? 'CONTACT_HAS_OPEN_DEBTS' : null
}

export interface ExistingContact {
  id: string
  name: string
  phone?: string | null
  phoneAlt?: string | null
  email?: string | null
}

export interface ContactDuplicate {
  contactId: string
  name: string
  /** What matched: the phone number, the email, or both. */
  matchedOn: Array<'phone' | 'email'>
}

/**
 * What a new contact clashes with. `nameTaken` is another contact with the same name (by
 * its slug): that always stops it. `duplicates` are contacts with the same phone number or
 * email: those stop it unless the person chose to merge or to create it anyway.
 */
export function findContactClashes(
  candidate: { name: string; phone?: string | null; email?: string | null; selfId?: string | null },
  existing: ReadonlyArray<ExistingContact>,
): { nameTaken: ExistingContact | null; duplicates: ContactDuplicate[] } {
  const key = contactNameKey(candidate.name)
  const phone = normalizePhone(candidate.phone)
  const email = normalizeEmail(candidate.email)
  const others = existing.filter((c) => c.id !== candidate.selfId)
  const nameTaken = others.find((c) => contactNameKey(c.name) === key) ?? null
  const duplicates: ContactDuplicate[] = []
  for (const contact of others) {
    const matchedOn: Array<'phone' | 'email'> = []
    const theirPhones = [contact.phone, contact.phoneAlt].map((p) => normalizePhone(p))
    if (phone && theirPhones.includes(phone)) matchedOn.push('phone')
    if (email && normalizeEmail(contact.email) === email) matchedOn.push('email')
    if (matchedOn.length) duplicates.push({ contactId: contact.id, name: contact.name, matchedOn })
  }
  return { nameTaken, duplicates }
}

/** What to do when a new contact matches an existing one by phone or email. */
export type ContactDuplicateResolution = 'MERGE' | 'CREATE'

export interface MergeableContact {
  type: ContactType | `${ContactType}`
  name: string
  phone?: string | null
  phoneAlt?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

/**
 * Merging a new contact into an existing one: it takes the new name when it differs,
 * becomes both customer and supplier when the types differ, and keeps its own phone, email,
 * address and notes, filling only what it was missing.
 */
export function mergeContact(
  existing: MergeableContact,
  incoming: MergeableContact,
): MergeableContact {
  const pick = (current?: string | null, next?: string | null) =>
    current?.trim() || next?.trim() || null
  return {
    type:
      existing.type === incoming.type || existing.type === ContactType.BOTH
        ? existing.type
        : ContactType.BOTH,
    name: incoming.name.trim() || existing.name,
    phone: pick(existing.phone, incoming.phone),
    phoneAlt: pick(existing.phoneAlt, incoming.phoneAlt),
    email: pick(existing.email, incoming.email),
    address: pick(existing.address, incoming.address),
    notes: pick(existing.notes, incoming.notes),
  }
}
