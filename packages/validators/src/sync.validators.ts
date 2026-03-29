import { z } from 'zod'

const SyncRecordSchema = z.object({
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
  isDeleted: z.boolean(),
}).catchall(z.unknown())

export const SyncPayloadSchema = z.object({
  deviceId: z.string().min(1),
  businessId: z.string().uuid(),
  lastSyncedAt: z.string().datetime().nullable(),
  changes: z.object({
    products: z.array(SyncRecordSchema).optional(),
    productCategories: z.array(SyncRecordSchema).optional(),
    sales: z.array(SyncRecordSchema).optional(),
    saleItems: z.array(SyncRecordSchema).optional(),
    expenses: z.array(SyncRecordSchema).optional(),
    stockMovements: z.array(SyncRecordSchema).optional(),
  }),
})

export type SyncPayloadInput = z.infer<typeof SyncPayloadSchema>
