import { Resource } from './permissions.types'

/**
 * BIZ-5.5 — the module registration framework. "One ledger, many modules": the subscription gates a
 * module's feature SURFACE (screens, reports, close steps), never the ledger. A module is a coherent
 * slice of the product (sales, the online store, …); it is "on" for a business when the plan grants
 * its `requiredResource` (activation = plan entitlement — there is no per-business toggle).
 *
 * This registry is the single shared source of truth, read by both the API and the desktop client.
 */
export enum BusinessModuleKey {
  CORE_SALES = 'CORE_SALES',
  INVENTORY = 'INVENTORY',
  EXPENSES = 'EXPENSES',
  DEBTS = 'DEBTS',
  CASH = 'CASH',
  PROCUREMENT = 'PROCUREMENT',
  ONLINE_STORE = 'ONLINE_STORE',
  FISCAL = 'FISCAL',
}

export interface BusinessModuleManifest {
  key: BusinessModuleKey
  /** Human label (used in diagnostics / future settings; not yet an i18n key). */
  label: string
  /**
   * The plan-tier feature that unlocks this module, or `null` for a core module that every plan has.
   * MUST be a plan-tier feature flag (e.g. Resource.ONLINE_STORE) — never a fine-grained role
   * permission (Resource.PRODUCTS_VIEW etc.), which every plan already holds.
   */
  requiredResource: Resource | null

  // ── Reserved contribution slots ────────────────────────────────────────────
  // Typed so they cannot be populated before a runtime target exists — the type IS the "reserved"
  // marker. Each names the epic that will give it meaning.

  /** Keys this module contributes to the period-close pipeline (PERIOD_CLOSE_STEPS). Empty today; a
   *  module registers its actual PeriodCloseStep in its own NestJS module (BIZ-5.3/5.5 seam). */
  closeStepKeys?: readonly string[]
  /** Ledger epic — nothing to post to yet (no chart of accounts / journal exists). */
  postingRules?: readonly never[]
  /** Chart-of-accounts epic — no account entity exists to require yet. */
  requiredAccounts?: readonly never[]
  /** Profile-aware vocabulary landed in BIZ-5.7 at the client i18n layer (a profile axis on
   *  `useT()` — see the renderer's i18n/vocabulary), not via the module manifest. This slot stays
   *  reserved for a future world where a module contributes its own vocabulary keys. */
  vocabulary?: Record<string, never>
}

/**
 * Every module in the product. Only ONLINE_STORE maps to a plan-tier feature today; the rest are core
 * (always on). New paid modules (Fixed Assets, Payroll, …) are added here with their own resource.
 */
export const MODULE_REGISTRY: readonly BusinessModuleManifest[] = [
  { key: BusinessModuleKey.CORE_SALES, label: 'Sales', requiredResource: null },
  { key: BusinessModuleKey.INVENTORY, label: 'Inventory', requiredResource: null },
  { key: BusinessModuleKey.EXPENSES, label: 'Expenses', requiredResource: null },
  { key: BusinessModuleKey.DEBTS, label: 'Debts & contacts', requiredResource: null },
  { key: BusinessModuleKey.CASH, label: 'Cash drawer', requiredResource: null },
  { key: BusinessModuleKey.PROCUREMENT, label: 'Procurement', requiredResource: null },
  {
    key: BusinessModuleKey.ONLINE_STORE,
    label: 'Online store',
    requiredResource: Resource.ONLINE_STORE,
  },
  { key: BusinessModuleKey.FISCAL, label: 'Accounting periods', requiredResource: null },
] as const
