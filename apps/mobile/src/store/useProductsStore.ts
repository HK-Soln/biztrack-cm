import { create } from 'zustand'
import { db } from '../db'
import { products, productCategories } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateUUID } from '../utils/uuid'
import { useAuthStore } from './useAuthStore'
import {
  getProducts,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  type Product,
  type ProductCategory,
  type CreateProductPayload,
  type UpdateProductPayload,
} from '../services/products.service'

export type { Product, ProductCategory, CreateProductPayload, UpdateProductPayload }

// ─── State ────────────────────────────────────────────────────────────────────

interface ProductsState {
  products: Product[]
  categories: ProductCategory[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  selectedCategoryId: string | null
  searchQuery: string

  // Computed
  filteredProducts: () => Product[]

  // Filters
  setSelectedCategory: (id: string | null) => void
  setSearchQuery: (q: string) => void

  // Data fetching
  fetchProducts: () => Promise<void>
  fetchCategories: () => Promise<void>

  // Mutations
  addProduct: (payload: CreateProductPayload) => Promise<Product>
  editProduct: (id: string, payload: UpdateProductPayload) => Promise<Product>
  removeProduct: (id: string) => Promise<void>
  addCategory: (name: string) => Promise<ProductCategory>
}

// ─── Store (SQLite Offline Caching Layer) ────────────────────────────────────

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  categories: [],
  isLoading: false,
  isSaving: false,
  error: null,
  selectedCategoryId: null,
  searchQuery: '',

  // ── Computed ──

  filteredProducts: () => {
    const { products, selectedCategoryId, searchQuery } = get()
    let result = products.filter((p) => p.isActive)

    if (selectedCategoryId) {
      result = result.filter((p) => p.categoryId === selectedCategoryId)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q),
      )
    }

    return result
  },

  // ── Filters ──

  setSelectedCategory: (id) => set({ selectedCategoryId: id }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  // ── Data fetching ──

  fetchProducts: async () => {
    // 1. Immediate Offline Load: Query local SQLite
    set({ isLoading: true, error: null })
    try {
      const localProducts = await db.select().from(products)
      
      const formattedLocal: Product[] = localProducts.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || undefined,
        sku: p.sku || undefined,
        barcode: p.barcode || undefined,
        price: p.price,
        costPrice: p.costPrice || undefined,
        stockQuantity: p.stockQuantity,
        lowStockThreshold: p.lowStockThreshold,
        unit: p.unit,
        categoryId: p.categoryId || undefined,
        isActive: p.isDeleted ? false : true,
        businessId: p.businessId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))

      set({ products: formattedLocal })
    } catch (err) {
      console.warn('Failed to load products from local SQLite:', err)
    } finally {
      set({ isLoading: false })
    }

    // 2. Background Sync: Fetch from remote API and upsert SQLite
    try {
      const remoteProducts = await getProducts()
      
      // Clear/sync SQLite with new values
      await db.transaction(async (tx) => {
        for (const rp of remoteProducts) {
          const businessId = rp.businessId || useAuthStore.getState().business?.id
          if (!businessId) {
            console.warn('[useProductsStore] Skipping remote product sync (no business ID):', rp.id)
            continue
          }
          const values = {
            id: rp.id,
            businessId,
            categoryId: rp.categoryId || null,
            name: rp.name,
            sku: rp.sku || null,
            barcode: rp.barcode || null,
            price: rp.price,
            costPrice: rp.costPrice || null,
            stockQuantity: rp.stockQuantity,
            lowStockThreshold: rp.lowStockThreshold || 5,
            unit: rp.unit || 'piece',
            description: rp.description || null,
            createdAt: new Date(rp.createdAt),
            updatedAt: new Date(rp.updatedAt),
            isDeleted: !rp.isActive,
          }

          // SQLite upsert
          await tx
            .insert(products)
            .values(values)
            .onConflictDoUpdate({
              target: products.id,
              set: values,
            })
        }
      })

      // Update local state with latest from SQLite
      const updatedLocal = await db.select().from(products)
      const formattedUpdated: Product[] = updatedLocal.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || undefined,
        sku: p.sku || undefined,
        barcode: p.barcode || undefined,
        price: p.price,
        costPrice: p.costPrice || undefined,
        stockQuantity: p.stockQuantity,
        lowStockThreshold: p.lowStockThreshold,
        unit: p.unit,
        categoryId: p.categoryId || undefined,
        isActive: p.isDeleted ? false : true,
        businessId: p.businessId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))

      set({ products: formattedUpdated, error: null })
    } catch (err) {
      console.log('Background product sync failed (offline mode):', err)
      // Fail silently and keep showing the cached offline SQLite database products
    }
  },

  fetchCategories: async () => {
    // 1. Immediate Offline Load
    try {
      const localCats = await db.select().from(productCategories)
      const formattedLocal: ProductCategory[] = localCats.map((c) => ({
        id: c.id,
        name: c.name,
        businessId: c.businessId,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }))
      set({ categories: formattedLocal })
    } catch (err) {
      console.warn('Failed to load categories from SQLite:', err)
    }

    // 2. Background Sync
    try {
      const remoteCats = await getCategories()
      
      await db.transaction(async (tx) => {
        for (const rc of remoteCats) {
          const businessId = rc.businessId || useAuthStore.getState().business?.id
          if (!businessId) {
            console.warn('[useProductsStore] Skipping remote category sync (no business ID):', rc.id)
            continue
          }
          const values = {
            id: rc.id,
            businessId,
            name: rc.name,
            createdAt: new Date(rc.createdAt),
            updatedAt: new Date(rc.updatedAt),
          }

          await tx
            .insert(productCategories)
            .values(values)
            .onConflictDoUpdate({
              target: productCategories.id,
              set: values,
            })
        }
      })

      const updatedCats = await db.select().from(productCategories)
      const formattedUpdated: ProductCategory[] = updatedCats.map((c) => ({
        id: c.id,
        name: c.name,
        businessId: c.businessId,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }))

      set({ categories: formattedUpdated })
    } catch (err) {
      console.log('Background category sync failed:', err)
    }
  },

  // ── Mutations ──

  addProduct: async (payload) => {
    set({ isSaving: true })
    try {
      // 1. Attempt API write
      const product = await createProduct(payload)

      // Save successfully to SQLite cache
      const businessId = product.businessId || useAuthStore.getState().business?.id
      if (!businessId) {
        throw new Error('Business ID missing: could not save product locally.')
      }

      await db.insert(products).values({
        id: product.id,
        businessId,
        categoryId: product.categoryId || null,
        name: product.name,
        sku: product.sku || null,
        barcode: product.barcode || null,
        price: product.price,
        costPrice: product.costPrice || null,
        stockQuantity: product.stockQuantity,
        lowStockThreshold: product.lowStockThreshold || 5,
        unit: product.unit || 'piece',
        description: product.description || null,
        createdAt: new Date(product.createdAt),
        updatedAt: new Date(product.updatedAt),
        isDeleted: false,
      })

      set((state) => ({ products: [product, ...state.products] }))
      return product
    } catch {
      // If offline, we can also write directly to local SQLite to ensure the merchant
      // is completely unblocked during checkout / stock adjustment.
      const businessId = useAuthStore.getState().business?.id
      if (!businessId) {
        throw new Error('Session non initialisée. Veuillez vous reconnecter.')
      }

      const localId = generateUUID()
      const now = new Date()
      const offlineProduct: Product = {
        id: localId,
        name: payload.name,
        description: payload.description,
        sku: payload.sku,
        barcode: payload.barcode,
        price: payload.price,
        costPrice: payload.costPrice,
        stockQuantity: payload.stockQuantity ?? 0,
        lowStockThreshold: payload.lowStockThreshold ?? 5,
        unit: payload.unit ?? 'piece',
        categoryId: payload.categoryId,
        isActive: payload.isActive ?? true,
        businessId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }

      await db.insert(products).values({
        id: localId,
        businessId,
        categoryId: payload.categoryId || null,
        name: payload.name,
        sku: payload.sku || null,
        barcode: payload.barcode || null,
        price: payload.price,
        costPrice: payload.costPrice || null,
        stockQuantity: payload.stockQuantity ?? 0,
        lowStockThreshold: payload.lowStockThreshold ?? 5,
        unit: payload.unit ?? 'piece',
        description: payload.description || null,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      })

      set((state) => ({ products: [offlineProduct, ...state.products] }))
      return offlineProduct;
    } finally {
      set({ isSaving: false })
    }
  },

  editProduct: async (id, payload) => {
    set({ isSaving: true })
    try {
      const updated = await updateProduct(id, payload)

      // Update local SQLite
      const now = new Date()
      const updateValues: Record<string, string | number | Date | null> = {
        updatedAt: now,
      }
      if (payload.name !== undefined) updateValues.name = payload.name
      if (payload.price !== undefined) updateValues.price = payload.price
      if (payload.sku !== undefined) updateValues.sku = payload.sku
      if (payload.barcode !== undefined) updateValues.barcode = payload.barcode
      if (payload.costPrice !== undefined) updateValues.costPrice = payload.costPrice
      if (payload.stockQuantity !== undefined) updateValues.stockQuantity = payload.stockQuantity
      if (payload.lowStockThreshold !== undefined) updateValues.lowStockThreshold = payload.lowStockThreshold
      if (payload.unit !== undefined) updateValues.unit = payload.unit
      if (payload.categoryId !== undefined) updateValues.categoryId = payload.categoryId || null
      if (payload.description !== undefined) updateValues.description = payload.description || null

      await db.update(products).set(updateValues).where(eq(products.id, id))

      set((state) => ({
        products: state.products.map((p) => (p.id === id ? updated : p)),
      }))
      return updated
    } catch {
      // Local SQLite fallback update
      const now = new Date()
      const updateValues: Record<string, string | number | Date | null> = {
        updatedAt: now,
      }
      if (payload.name !== undefined) updateValues.name = payload.name
      if (payload.price !== undefined) updateValues.price = payload.price
      if (payload.sku !== undefined) updateValues.sku = payload.sku
      if (payload.barcode !== undefined) updateValues.barcode = payload.barcode
      if (payload.costPrice !== undefined) updateValues.costPrice = payload.costPrice
      if (payload.stockQuantity !== undefined) updateValues.stockQuantity = payload.stockQuantity
      if (payload.lowStockThreshold !== undefined) updateValues.lowStockThreshold = payload.lowStockThreshold
      if (payload.unit !== undefined) updateValues.unit = payload.unit
      if (payload.categoryId !== undefined) updateValues.categoryId = payload.categoryId || null
      if (payload.description !== undefined) updateValues.description = payload.description || null

      await db.update(products).set(updateValues).where(eq(products.id, id))

      let localUpdated: Product | null = null
      set((state) => {
        const nextProducts = state.products.map((p) => {
          if (p.id === id) {
            localUpdated = {
              ...p,
              ...payload,
              updatedAt: now.toISOString(),
            } as Product
            return localUpdated
          }
          return p
        })
        return { products: nextProducts }
      })

      if (!localUpdated) throw new Error('Product not found.')
      return localUpdated
    } finally {
      set({ isSaving: false })
    }
  },

  removeProduct: async (id) => {
    set({ isSaving: true })

    // 1. Soft-delete in SQLite first (source of truth for offline)
    try {
      const now = new Date()
      await db
        .update(products)
        .set({ isDeleted: true, updatedAt: now })
        .where(eq(products.id, id))

      // 2. Only remove from state after the local write succeeds
      set((state) => ({ products: state.products.filter((p) => p.id !== id) }))
    } catch (err) {
      console.warn('Failed to soft-delete product locally:', err)
      set({ isSaving: false })
      throw err
    }

    // 3. Best-effort remote deletion (fire-and-forget — offline is fine)
    try {
      await deleteProduct(id)
    } catch {
      // Remote deletion failed — local soft-delete is retained for future sync
    } finally {
      set({ isSaving: false })
    }
  },

  addCategory: async (name) => {
    set({ isSaving: true })
    try {
      const category = await createCategory(name)

      // Save category to SQLite
      const businessId = category.businessId || useAuthStore.getState().business?.id
      if (!businessId) {
        throw new Error('Business ID missing: could not save category locally.')
      }

      await db.insert(productCategories).values({
        id: category.id,
        businessId,
        name: category.name,
        createdAt: new Date(category.createdAt),
        updatedAt: new Date(category.updatedAt),
      })

      set((state) => ({ categories: [...state.categories, category] }))
      return category
    } catch {
      // Local fallback insert
      const businessId = useAuthStore.getState().business?.id
      if (!businessId) {
        throw new Error('Session non initialisée. Veuillez vous reconnecter.')
      }

      const localId = generateUUID()
      const now = new Date()
      const localCat: ProductCategory = {
        id: localId,
        name,
        businessId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }

      await db.insert(productCategories).values({
        id: localId,
        businessId,
        name,
        createdAt: now,
        updatedAt: now,
      })

      set((state) => ({ categories: [...state.categories, localCat] }))
      return localCat
    } finally {
      set({ isSaving: false })
    }
  },
}))
