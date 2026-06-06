import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { db } from '../db'
import { expenses } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateUUID } from '../utils/uuid'
import { useAuthStore } from './useAuthStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | 'STOCK'
  | 'SALARIES'
  | 'RENT'
  | 'UTILITIES'
  | 'TRANSPORT'
  | 'MARKETING'
  | 'OTHER'

export interface Expense {
  id: string
  description: string
  amount: number          // XAF
  category: ExpenseCategory
  date: string            // ISO date string YYYY-MM-DD
  createdAt: string       // ISO timestamp
}

// ─── Category metadata ────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES: Record<
  ExpenseCategory,
  { label: string; color: string; bg: string; emoji: string }
> = {
  STOCK:      { label: 'Réapprovisionnement', color: '#185FA5', bg: '#E6F1FB', emoji: '📦' },
  SALARIES:   { label: 'Salaires',            color: '#639922', bg: '#EAF3DE', emoji: '👷' },
  RENT:       { label: 'Loyer',               color: '#BA7517', bg: '#FAEEDA', emoji: '🏠' },
  UTILITIES:  { label: 'Charges',             color: '#7C3AED', bg: '#EDE9FE', emoji: '⚡' },
  TRANSPORT:  { label: 'Transport',           color: '#0891B2', bg: '#E0F2FE', emoji: '🚚' },
  MARKETING:  { label: 'Marketing',           color: '#DB2777', bg: '#FCE7F3', emoji: '📣' },
  OTHER:      { label: 'Autre',               color: '#888780', bg: '#F1EFE8', emoji: '📝' },
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Le montant doit être un nombre positif.')
  }
}

function assertValidDate(date: string) {
  if (!DATE_RE.test(date)) {
    throw new Error('La date doit être au format YYYY-MM-DD.')
  }
}

function assertNonEmpty(value: string, field: string) {
  if (!value.trim()) {
    throw new Error(`${field} ne peut pas être vide.`)
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

interface ExpensesState {
  expenses: Expense[]

  fetchExpenses: () => Promise<void>
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>
  removeExpense: (id: string) => Promise<void>
  updateExpense: (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>) => Promise<void>

  // Computed — yearMonth must be in "YYYY-MM" format
  totalForMonth: (yearMonth: string) => number
  expensesForMonth: (yearMonth: string) => Expense[]
}

// ─── Store (SQLite Cache Layer) ──────────────────────────────────────────────

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  expenses: [],

  fetchExpenses: async () => {
    try {
      let results = await db.select().from(expenses)

      // Seeding check for legacy AsyncStorage data from prototypes
      if (results.length === 0) {
        const legacyDataStr = await AsyncStorage.getItem('biztrack-expenses')
        if (legacyDataStr) {
          try {
            const parsed = JSON.parse(legacyDataStr)
            const legacyExpenses = parsed?.state?.expenses || []
            if (legacyExpenses.length > 0) {
              // Resolve business ID once for the batch. Skip any row where
              // neither the legacy record nor the current session provides one
              // — 'default-biz' would create records that can never sync.
              const sessionBusinessId = useAuthStore.getState().business?.id
              let seeded = 0
              for (const e of legacyExpenses) {
                const businessId = e.businessId || sessionBusinessId
                if (!businessId) {
                  console.warn('[useExpensesStore] Skipping legacy expense (no business ID):', e.id)
                  continue
                }
                await db.insert(expenses).values({
                  id: e.id,
                  businessId,
                  amount: e.amount,
                  description: e.description,
                  category: e.category,
                  date: e.date,
                  createdAt: new Date(e.createdAt),
                  updatedAt: new Date(e.createdAt),
                })
                seeded++
              }
              if (seeded > 0) results = await db.select().from(expenses)
            }
          } catch (err) {
            console.error('Error seeding legacy expenses:', err)
          }
        }
      }

      // Convert Date objects to ISO string representation
      const formattedExpenses: Expense[] = results.map((e) => ({
        id: e.id,
        description: e.description || '',
        amount: e.amount,
        category: e.category as ExpenseCategory,
        date: e.date,
        createdAt: e.createdAt.toISOString(),
      }))

      set({ expenses: formattedExpenses })
    } catch (err) {
      console.error('Error fetching expenses from SQLite:', err)
    }
  },

  addExpense: async (data) => {
    assertValidAmount(data.amount)
    assertValidDate(data.date)
    assertNonEmpty(data.description, 'Description')

    const id = generateUUID()
    const now = new Date()

    const businessId = useAuthStore.getState().business?.id
    if (!businessId) {
      throw new Error('Session non initialisée. Veuillez vous reconnecter.')
    }

    const newExpenseValues = {
      id,
      businessId,
      amount: data.amount,
      description: data.description,
      category: data.category,
      date: data.date,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(expenses).values(newExpenseValues)

    const newExpense: Expense = {
      id,
      description: data.description,
      amount: data.amount,
      category: data.category,
      date: data.date,
      createdAt: now.toISOString(),
    }

    set((state) => ({
      expenses: [newExpense, ...state.expenses],
    }))
  },

  removeExpense: async (id) => {
    await db.delete(expenses).where(eq(expenses.id, id))

    set((state) => ({
      expenses: state.expenses.filter((e) => e.id !== id),
    }))
  },

  updateExpense: async (id, updates) => {
    if (updates.amount !== undefined) assertValidAmount(updates.amount)
    if (updates.date !== undefined) assertValidDate(updates.date)
    if (updates.description !== undefined) assertNonEmpty(updates.description, 'Description')

    const now = new Date()
    const updateValues: Record<string, string | number | Date> = {
      updatedAt: now,
    }
    if (updates.amount !== undefined) updateValues.amount = updates.amount
    if (updates.description !== undefined) updateValues.description = updates.description
    if (updates.category !== undefined) updateValues.category = updates.category
    if (updates.date !== undefined) updateValues.date = updates.date

    await db.update(expenses).set(updateValues).where(eq(expenses.id, id))

    set((state) => ({
      expenses: state.expenses.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    }))
  },

  // Use exact slice comparison ("YYYY-MM") to avoid partial-prefix false matches
  // e.g. "2026-1" must NOT match "2026-10", "2026-11", "2026-12"
  totalForMonth: (yearMonth) => {
    if (!YEAR_MONTH_RE.test(yearMonth)) {
      throw new Error('yearMonth doit être au format YYYY-MM (ex: "2026-04").')
    }
    return get()
      .expenses.filter((e) => e.date.slice(0, 7) === yearMonth)
      .reduce((sum, e) => sum + e.amount, 0)
  },

  expensesForMonth: (yearMonth) => {
    if (!YEAR_MONTH_RE.test(yearMonth)) {
      throw new Error('yearMonth doit être au format YYYY-MM (ex: "2026-04").')
    }
    return get().expenses.filter((e) => e.date.slice(0, 7) === yearMonth)
  },
}))

