import { BusinessProfileTier } from '@biztrack/types'
import type { Lang } from '.'
import type { MessageKey } from './messages'

/**
 * BIZ-5.7 — profile-aware vocabulary. The base catalog (`messages.ts`) carries the standard /
 * SME wording; this overlays alternative wording per business profile. `useT()` prefers a
 * profile override, then falls through to the base catalog — so an unset key just uses the base.
 *
 * The driving rule: a MICRO boutique owner must never meet accounting jargon like "période" or
 * "exercice". The accounting-period surface reads in plain month/year terms for them; an SME /
 * accountant keeps the formal vocabulary. The map grows key-by-key as jargon surfaces.
 */
type VocabOverride = Partial<Record<Lang, Partial<Record<MessageKey, string>>>>

export const profileVocab: Partial<Record<BusinessProfileTier, VocabOverride>> = {
  [BusinessProfileTier.MICRO]: {
    fr: {
      'periods.title': 'Clôtures mensuelles',
      'periods.sub':
        'Clôturez chaque mois une fois les comptes arrêtés. Un mois clôturé peut être verrouillé pour empêcher toute modification.',
      'periods.fiscalYear': 'Année',
      'periods.period': 'Mois',
      'periods.onlineOnly': 'Vous êtes hors ligne — les clôtures se chargeront à la reconnexion.',
      'periods.ownerOnly': 'Seul le propriétaire peut clôturer ou verrouiller un mois.',
    },
    en: {
      'periods.title': 'Monthly closings',
      'periods.sub':
        'Close each month once its books are final. A closed month can be locked to prevent further changes.',
      'periods.fiscalYear': 'Year',
      'periods.period': 'Month',
      'periods.onlineOnly': "You're offline — monthly closings load when you reconnect.",
      'periods.ownerOnly': 'Only the business owner can close or lock a month.',
    },
  },
}
