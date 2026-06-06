import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { PaymentMethod } from './cart.store'
import { db } from '../db'
import { debts, debtPayments } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateUUID } from '../utils/uuid'
import { useAuthStore } from './useAuthStore'

// ─── Shared Types ────────────────────────────────────────────────────────────

export type DebtDirection = 'RECEIVABLE' | 'PAYABLE'
export type DebtSource = 'SALE' | 'RESTOCK' | 'MANUAL'
export type DebtStatus = 'OUTSTANDING' | 'PARTIALLY_PAID' | 'SETTLED' | 'WRITTEN_OFF'

export interface DebtPayment {
  id: string
  businessId: string
  debtId: string
  amount: number
  method: PaymentMethod
  paymentDate: string
  notes?: string | null
  createdAt: string
}

export interface Debt {
  id: string
  businessId: string
  contactId: string
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
  createdAt: string
  settledAt?: string | null
  writtenOffAt?: string | null
  writtenOffReason?: string | null
  payments: DebtPayment[]
}

export interface StatementEntry {
  id: string
  date: string
  type: 'DEBT_CREATED' | 'PAYMENT' | 'WRITE_OFF'
  description: string
  debit: number
  credit: number
  amount: number
}

export interface CreateDebtPayload {
  contactId: string
  direction: DebtDirection
  sourceType: DebtSource
  sourceId?: string
  sourceReference?: string
  originalAmount: number
  dueDate?: string | null
  notes?: string | null
}

export interface RecordPaymentPayload {
  amount: number
  method: PaymentMethod
  paymentDate: string
  notes?: string | null
}

// ─── State Interface ─────────────────────────────────────────────────────────

interface DebtsState {
  debts: Debt[]
  isLoading: boolean
  isSaving: boolean
  error: string | null

  // Computed / Selectors
  getOutstandingBalance: (direction: DebtDirection) => number
  getOutstandingCount: (direction: DebtDirection) => number
  getDebtsByContact: (contactId: string) => Debt[]
  getContactStatement: (contactId: string) => StatementEntry[] // Statement ledger data

  // Operations
  fetchDebts: () => Promise<void>
  addDebt: (payload: CreateDebtPayload) => Promise<Debt>
  recordPayment: (debtId: string, payload: RecordPaymentPayload) => Promise<DebtPayment>
  writeOffDebt: (debtId: string, reason: string) => Promise<Debt>
  clearStore: () => void
}

// ─── Debts Store (SQLite Cache Layer) ────────────────────────────────────────

export const useDebtsStore = create<DebtsState>((set, get) => ({
  debts: [],
  isLoading: false,
  isSaving: false,
  error: null,

  // ── Selectors ──
  getOutstandingBalance: (direction) => {
    return get().debts
      .filter((d) => d.direction === direction && d.status !== 'SETTLED' && d.status !== 'WRITTEN_OFF')
      .reduce((sum, d) => sum + d.outstandingAmount, 0)
  },

  getOutstandingCount: (direction) => {
    return get().debts
      .filter((d) => d.direction === direction && d.status !== 'SETTLED' && d.status !== 'WRITTEN_OFF')
      .length
  },

  getDebtsByContact: (contactId) => {
    return get().debts.filter((d) => d.contactId === contactId)
  },

  getContactStatement: (contactId) => {
    const debts = get().debts.filter((d) => d.contactId === contactId)
    const entries: StatementEntry[] = []

    debts.forEach((d) => {
      // Debt Created Entry
      entries.push({
        id: d.id,
        date: d.createdAt,
        type: 'DEBT_CREATED',
        description: d.sourceType === 'SALE' 
          ? `Vente à crédit (${d.sourceReference})` 
          : d.sourceType === 'RESTOCK'
          ? `Ravitaillement à crédit (${d.sourceReference})`
          : `Dette manuelle (${d.sourceReference})`,
        debit: d.direction === 'RECEIVABLE' ? d.originalAmount : 0,
        credit: d.direction === 'PAYABLE' ? d.originalAmount : 0,
        amount: d.originalAmount,
      })

      // Payments Entries
      d.payments.forEach((p) => {
        entries.push({
          id: p.id,
          date: p.paymentDate,
          type: 'PAYMENT',
          description: `Paiement reçu (${p.method === 'MOBILE_MONEY' ? 'Mobile Money' : p.method === 'CARD' ? 'Carte' : 'Espèces'})`,
          debit: d.direction === 'PAYABLE' ? p.amount : 0,
          credit: d.direction === 'RECEIVABLE' ? p.amount : 0,
          amount: p.amount,
        })
      })

      // Write Off Entries
      if (d.status === 'WRITTEN_OFF') {
        entries.push({
          id: `${d.id}-writeoff`,
          date: d.writtenOffAt || d.createdAt,
          type: 'WRITE_OFF',
          description: `Annulation de dette : ${d.writtenOffReason || 'Non spécifié'}`,
          debit: d.direction === 'PAYABLE' ? d.outstandingAmount : 0,
          credit: d.direction === 'RECEIVABLE' ? d.outstandingAmount : 0,
          amount: d.outstandingAmount,
        })
      }
    })

    // Sort entries by date (ascending)
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return entries
  },

  // ── Actions ──
  fetchDebts: async () => {
    set({ isLoading: true, error: null })
    try {
      let resultsDebts = await db.select().from(debts)
      let resultsPayments = await db.select().from(debtPayments)

      // Seeding check for legacy AsyncStorage data from prototypes
      if (resultsDebts.length === 0) {
        const legacyDataStr = await AsyncStorage.getItem('biztrack-debts')
        if (legacyDataStr) {
          try {
            const parsed = JSON.parse(legacyDataStr)
            const legacyDebts = parsed?.state?.debts || []
            if (legacyDebts.length > 0) {
              // Resolve business ID once for the batch. Skip rows where
              // neither the legacy record nor the session provides one —
              // 'default-biz' creates records that can never sync.
              const sessionBusinessId = useAuthStore.getState().business?.id
              let seeded = 0
              for (const d of legacyDebts) {
                const businessId = d.businessId || sessionBusinessId
                if (!businessId) {
                  console.warn('[useDebtsStore] Skipping legacy debt (no business ID):', d.id)
                  continue
                }

                // Insert debt
                await db.insert(debts).values({
                  id: d.id,
                  businessId,
                  contactId: d.contactId,
                  direction: d.direction,
                  sourceType: d.sourceType,
                  sourceId: d.sourceId || '',
                  sourceReference: d.sourceReference || '',
                  originalAmount: d.originalAmount,
                  paidAmount: d.paidAmount,
                  outstandingAmount: d.outstandingAmount,
                  status: d.status,
                  dueDate: d.dueDate || null,
                  notes: d.notes || null,
                  settledAt: d.settledAt ? new Date(d.settledAt) : null,
                  writtenOffAt: d.writtenOffAt ? new Date(d.writtenOffAt) : null,
                  writtenOffReason: d.writtenOffReason || null,
                  createdAt: new Date(d.createdAt),
                  updatedAt: new Date(d.createdAt),
                })
                seeded++

                // Insert payments for this debt — inherit the resolved businessId
                if (d.payments && d.payments.length > 0) {
                  for (const p of d.payments) {
                    await db.insert(debtPayments).values({
                      id: p.id,
                      businessId: p.businessId || businessId,
                      debtId: p.debtId,
                      amount: p.amount,
                      method: p.method,
                      paymentDate: p.paymentDate,
                      notes: p.notes || null,
                      createdAt: new Date(p.createdAt || p.paymentDate),
                      updatedAt: new Date(p.createdAt || p.paymentDate),
                    })
                  }
                }
              }
              // Re-fetch from SQLite only if something was written
              if (seeded > 0) {
                resultsDebts = await db.select().from(debts)
                resultsPayments = await db.select().from(debtPayments)
              }
            }
          } catch (e) {
            console.error('Error seeding legacy debts:', e)
          }
        }
      }

      // Group payments by debtId
      const paymentsMap: Record<string, DebtPayment[]> = {}
      resultsPayments.forEach((p) => {
        const payment: DebtPayment = {
          id: p.id,
          businessId: p.businessId,
          debtId: p.debtId,
          amount: p.amount,
          method: p.method as PaymentMethod,
          paymentDate: p.paymentDate,
          notes: p.notes || null,
          createdAt: p.createdAt.toISOString(),
        }
        if (!paymentsMap[p.debtId]) {
          paymentsMap[p.debtId] = []
        }
        paymentsMap[p.debtId].push(payment)
      })

      // Map debts
      const formattedDebts: Debt[] = resultsDebts.map((d) => ({
        id: d.id,
        businessId: d.businessId,
        contactId: d.contactId,
        direction: d.direction as DebtDirection,
        sourceType: d.sourceType as DebtSource,
        sourceId: d.sourceId || '',
        sourceReference: d.sourceReference || '',
        originalAmount: d.originalAmount,
        paidAmount: d.paidAmount,
        outstandingAmount: d.outstandingAmount,
        status: d.status as DebtStatus,
        dueDate: d.dueDate || null,
        notes: d.notes || null,
        createdAt: d.createdAt.toISOString(),
        settledAt: d.settledAt ? d.settledAt.toISOString() : null,
        writtenOffAt: d.writtenOffAt ? d.writtenOffAt.toISOString() : null,
        writtenOffReason: d.writtenOffReason || null,
        payments: paymentsMap[d.id] || [],
      }))

      set({ debts: formattedDebts })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching debts'
      set({ error: errorMessage })
    } finally {
      set({ isLoading: false })
    }
  },

  addDebt: async (payload) => {
    if (payload.originalAmount <= 0) {
      throw new Error('Le montant initial de la dette doit être supérieur à 0.')
    }

    set({ isSaving: true })
    try {
      const id = generateUUID()
      const now = new Date()
      const ref = payload.sourceReference || `REF-${Math.floor(Math.random() * 900000 + 100000)}`
      
      const businessId = useAuthStore.getState().business?.id
      if (!businessId) {
        throw new Error('Session non initialisée. Veuillez vous reconnecter.')
      }
      
      const newDebtValues = {
        id,
        businessId,
        contactId: payload.contactId,
        direction: payload.direction,
        sourceType: payload.sourceType,
        sourceId: payload.sourceId || '',
        sourceReference: ref,
        originalAmount: payload.originalAmount,
        paidAmount: 0,
        outstandingAmount: payload.originalAmount,
        status: 'OUTSTANDING' as DebtStatus,
        dueDate: payload.dueDate || null,
        notes: payload.notes || null,
        createdAt: now,
        updatedAt: now,
      }

      await db.insert(debts).values(newDebtValues)

      const newDebt: Debt = {
        ...newDebtValues,
        createdAt: now.toISOString(),
        settledAt: null,
        writtenOffAt: null,
        writtenOffReason: null,
        payments: [],
      }

      set((state) => ({
        debts: [newDebt, ...state.debts],
      }))
      return newDebt
    } finally {
      set({ isSaving: false })
    }
  },

  recordPayment: async (debtId, payload) => {
    if (payload.amount <= 0) {
      throw new Error('Le montant du paiement doit être supérieur à 0.')
    }

    set({ isSaving: true })
    try {
      let newPayment: DebtPayment | null = null

      await db.transaction(async (tx) => {
        const existingDebts = await tx.select().from(debts).where(eq(debts.id, debtId))
        if (existingDebts.length === 0) {
          throw new Error('Dette introuvable.')
        }
        const d = existingDebts[0]

        if (payload.amount > d.outstandingAmount) {
          throw new Error(`Le montant du paiement (${payload.amount} CFA) dépasse le solde dû (${d.outstandingAmount} CFA).`)
        }

        const now = new Date()
        const paymentId = generateUUID()

        await tx.insert(debtPayments).values({
          id: paymentId,
          businessId: d.businessId,
          debtId: d.id,
          amount: payload.amount,
          method: payload.method,
          paymentDate: payload.paymentDate,
          notes: payload.notes || null,
          createdAt: now,
          updatedAt: now,
        })

        const nextPaid = d.paidAmount + payload.amount
        const nextOutstanding = Math.max(0, d.originalAmount - nextPaid)
        const nextStatus = nextOutstanding <= 0 ? 'SETTLED' : 'PARTIALLY_PAID'
        const settledAtDate = nextOutstanding <= 0 ? now : null

        await tx.update(debts)
          .set({
            paidAmount: nextPaid,
            outstandingAmount: nextOutstanding,
            status: nextStatus,
            settledAt: settledAtDate,
            updatedAt: now,
          })
          .where(eq(debts.id, debtId))

        newPayment = {
          id: paymentId,
          businessId: d.businessId,
          debtId: d.id,
          amount: payload.amount,
          method: payload.method,
          paymentDate: payload.paymentDate,
          notes: payload.notes || null,
          createdAt: now.toISOString(),
        }
      })

      if (!newPayment) {
        throw new Error('Erreur lors du traitement du paiement.')
      }

      set((state) => {
        const nextDebts = state.debts.map((d) => {
          if (d.id === debtId) {
            const nextPaid = d.paidAmount + payload.amount
            const nextOutstanding = Math.max(0, d.originalAmount - nextPaid)
            const nextStatus: DebtStatus = nextOutstanding <= 0 ? 'SETTLED' : 'PARTIALLY_PAID'

            return {
              ...d,
              paidAmount: nextPaid,
              outstandingAmount: nextOutstanding,
              status: nextStatus,
              settledAt: nextOutstanding === 0 ? new Date().toISOString() : null,
              payments: [...d.payments, newPayment!],
            }
          }
          return d
        })
        return { debts: nextDebts }
      })

      return newPayment
    } finally {
      set({ isSaving: false })
    }
  },

  writeOffDebt: async (debtId, reason) => {
    if (!reason.trim()) {
      throw new Error("Une raison d'annulation est requise.")
    }

    set({ isSaving: true })
    try {
      const now = new Date()
      await db.update(debts)
        .set({
          status: 'WRITTEN_OFF',
          writtenOffAt: now,
          writtenOffReason: reason.trim(),
          updatedAt: now,
        })
        .where(eq(debts.id, debtId))

      let updated: Debt | null = null

      set((state) => {
        const nextDebts = state.debts.map((d) => {
          if (d.id === debtId) {
            updated = {
              ...d,
              status: 'WRITTEN_OFF',
              writtenOffAt: now.toISOString(),
              writtenOffReason: reason.trim(),
            }
            return updated
          }
          return d
        })

        return { debts: nextDebts }
      })

      if (!updated) {
        throw new Error('Dette introuvable.')
      }

      return updated
    } finally {
      set({ isSaving: false })
    }
  },

  clearStore: () => set({ debts: [] }),
}))

