import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { db } from '../db'
import { contacts } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateUUID } from '../utils/uuid'
import { useAuthStore } from './useAuthStore'

// ─── Shared Types ────────────────────────────────────────────────────────────

export type ContactType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH'

export interface Contact {
  id: string
  businessId: string
  type: ContactType
  name: string
  phone?: string | null
  phoneAlt?: string | null
  address?: string | null
  notes?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CreateContactPayload = {
  type: ContactType
  name: string
  phone?: string | null
  phoneAlt?: string | null
  address?: string | null
  notes?: string | null
}

export type UpdateContactPayload = Partial<CreateContactPayload>

// ─── State Interface ─────────────────────────────────────────────────────────

interface ContactsState {
  contacts: Contact[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  searchQuery: string
  selectedType: ContactType | 'ALL'

  // Computed
  filteredContacts: () => Contact[]

  // Setters
  setSearchQuery: (q: string) => void
  setSelectedType: (type: ContactType | 'ALL') => void

  // Operations
  fetchContacts: () => Promise<void>
  addContact: (payload: CreateContactPayload) => Promise<Contact>
  editContact: (id: string, payload: UpdateContactPayload) => Promise<Contact>
  removeContact: (id: string) => Promise<void>
}

// ─── Contacts Store (SQLite Cache Layer) ─────────────────────────────────────

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  isLoading: false,
  isSaving: false,
  error: null,
  searchQuery: '',
  selectedType: 'ALL',

  // ── Computed Filter ──
  filteredContacts: () => {
    const { contacts, searchQuery, selectedType } = get()
    let result = contacts.filter((c) => c.isActive)

    if (selectedType !== 'ALL') {
      result = result.filter((c) => c.type === selectedType || c.type === 'BOTH')
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.address?.toLowerCase().includes(q)
      )
    }

    return result
  },

  // ── Actions ──
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedType: (type) => set({ selectedType: type }),

  fetchContacts: async () => {
    set({ isLoading: true, error: null })
    try {
      let results = await db.select().from(contacts)

      // Seeding check for legacy AsyncStorage data from prototypes
      if (results.length === 0) {
        const legacyDataStr = await AsyncStorage.getItem('biztrack-contacts')
        if (legacyDataStr) {
          try {
            const parsed = JSON.parse(legacyDataStr)
            const legacyContacts = parsed?.state?.contacts || []
            if (legacyContacts.length > 0) {
              // Resolve the active business ID once for the whole batch.
              // If neither the legacy row nor the current session carries one,
              // skip the row — writing 'default-biz' would create unreconcilable
              // records that can never sync to the real business.
              const sessionBusinessId = useAuthStore.getState().business?.id
              let seeded = 0
              for (const c of legacyContacts) {
                const businessId = c.businessId || sessionBusinessId
                if (!businessId) {
                  console.warn('[useContactsStore] Skipping legacy contact (no business ID):', c.id)
                  continue
                }
                await db.insert(contacts).values({
                  id: c.id,
                  businessId,
                  type: c.type,
                  name: c.name,
                  phone: c.phone || null,
                  phoneAlt: c.phoneAlt || null,
                  address: c.address || null,
                  notes: c.notes || null,
                  isActive: c.isActive,
                  createdAt: new Date(c.createdAt),
                  updatedAt: new Date(c.updatedAt),
                })
                seeded++
              }
              // Re-fetch from SQLite only if something was actually seeded
              if (seeded > 0) results = await db.select().from(contacts)
            }
          } catch (e) {
            console.error('Error seeding legacy contacts:', e)
          }
        }
      }

      // Convert Date objects to ISO string representation
      const formattedContacts: Contact[] = results.map((c) => ({
        id: c.id,
        businessId: c.businessId,
        type: c.type as ContactType,
        name: c.name,
        phone: c.phone || null,
        phoneAlt: c.phoneAlt || null,
        address: c.address || null,
        notes: c.notes || null,
        isActive: c.isActive,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }))

      set({ contacts: formattedContacts })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching contacts'
      set({ error: errorMessage })
    } finally {
      set({ isLoading: false })
    }
  },

  addContact: async (payload) => {
    if (!payload.name.trim()) {
      throw new Error('Le nom du contact est obligatoire.')
    }

    set({ isSaving: true })
    try {
      const id = generateUUID()
      const now = new Date()
      const businessId = useAuthStore.getState().business?.id
      if (!businessId) {
        throw new Error('Session non initialisée. Veuillez vous reconnecter.')
      }
      const newContactValues = {
        id,
        businessId,
        type: payload.type,
        name: payload.name.trim(),
        phone: payload.phone?.trim() || null,
        phoneAlt: payload.phoneAlt?.trim() || null,
        address: payload.address?.trim() || null,
        notes: payload.notes?.trim() || null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }

      await db.insert(contacts).values(newContactValues)

      const newContact: Contact = {
        ...newContactValues,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }

      set((state) => ({
        contacts: [newContact, ...state.contacts],
      }))
      return newContact
    } finally {
      set({ isSaving: false })
    }
  },

  editContact: async (id, payload) => {
    if (payload.name !== undefined && !payload.name.trim()) {
      throw new Error('Le nom du contact ne peut pas être vide.')
    }

    set({ isSaving: true })
    try {
      const now = new Date()
      const updateValues: Record<string, string | Date | null> = {
        updatedAt: now,
      }
      if (payload.type !== undefined) updateValues.type = payload.type
      if (payload.name !== undefined) updateValues.name = payload.name.trim()
      if (payload.phone !== undefined) updateValues.phone = payload.phone?.trim() || null
      if (payload.phoneAlt !== undefined) updateValues.phoneAlt = payload.phoneAlt?.trim() || null
      if (payload.address !== undefined) updateValues.address = payload.address?.trim() || null
      if (payload.notes !== undefined) updateValues.notes = payload.notes?.trim() || null

      await db.update(contacts).set(updateValues).where(eq(contacts.id, id))

      let updatedContact: Contact | null = null

      set((state) => {
        const nextContacts = state.contacts.map((c) => {
          if (c.id === id) {
            updatedContact = {
              ...c,
              ...payload,
              name: payload.name !== undefined ? payload.name.trim() : c.name,
              phone: payload.phone !== undefined ? (payload.phone?.trim() || null) : c.phone,
              phoneAlt: payload.phoneAlt !== undefined ? (payload.phoneAlt?.trim() || null) : c.phoneAlt,
              address: payload.address !== undefined ? (payload.address?.trim() || null) : c.address,
              notes: payload.notes !== undefined ? (payload.notes?.trim() || null) : c.notes,
              updatedAt: now.toISOString(),
            }
            return updatedContact
          }
          return c
        })

        return { contacts: nextContacts }
      })

      if (!updatedContact) {
        throw new Error('Contact introuvable.')
      }

      return updatedContact
    } finally {
      set({ isSaving: false })
    }
  },

  removeContact: async (id) => {
    set({ isSaving: true })
    try {
      const now = new Date()
      await db
        .update(contacts)
        .set({
          isActive: false,
          isDeleted: true,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(contacts.id, id))

      set((state) => ({
        contacts: state.contacts.map((c) =>
          c.id === id ? { ...c, isActive: false, updatedAt: now.toISOString() } : c
        ),
      }))
    } finally {
      set({ isSaving: false })
    }
  },
}))

