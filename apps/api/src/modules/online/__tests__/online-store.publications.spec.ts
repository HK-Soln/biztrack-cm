/// <reference types="jest" />
import { OnlineStoreService } from '../online-store.service'

// A draft store row (the editable source). Publishing snapshots this into a publication.
const draftStore = {
  id: 'store-1',
  businessId: 'biz-1',
  storeName: 'Akwa',
  storeSlug: 'akwa',
  tagline: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: '#111111',
  phone: null,
  email: null,
  address: null,
  city: null,
  whatsappNumber: null,
  currency: 'XAF',
  status: 'draft',
  isActive: true,
  hasUnpublishedChanges: true,
  showOutOfStock: false,
  allowOrderNotes: true,
  minOrderAmount: null,
  paymentCashOnDelivery: true,
  paymentMtnMomo: false,
  paymentOrangeMoney: false,
  paymentCard: false,
  offerDelivery: true,
  offerPickup: true,
  deliveryFee: 0,
  pickupAddress: null,
  deliveryCities: [],
  layoutTemplate: 'classic',
  themeId: 'a',
  appearance: 'light',
  catalogBinding: 'snapshot',
  showLowStockBadges: false,
  seoTitle: null,
  seoDescription: null,
  ogImageUrl: null,
  robotsIndex: true,
  socialInstagram: null,
  socialFacebook: null,
  socialTiktok: null,
  socialX: null,
  socialLinkedin: null,
}

// A full published-config snapshot (what applyConfigToStore/restore reads back).
const fullConfig = {
  storeName: 'Old name',
  storeSlug: 'akwa',
  tagline: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: '#222222',
  phone: null,
  email: null,
  address: null,
  city: null,
  whatsappNumber: null,
  currency: 'XAF',
  showOutOfStock: false,
  allowOrderNotes: true,
  minOrderAmount: null,
  payment: { cashOnDelivery: true, mtnMomo: false, orangeMoney: false, card: false },
  fulfilment: {
    offerDelivery: true,
    offerPickup: true,
    deliveryFee: 0,
    pickupAddress: null,
    deliveryCities: [],
  },
  appearance: {
    layoutTemplate: 'classic',
    themeId: 'a',
    appearance: 'light',
    catalogBinding: 'snapshot',
    showLowStockBadges: false,
  },
  seo: { seoTitle: null, seoDescription: null, ogImageUrl: null, robotsIndex: true },
  socials: { instagram: null, facebook: null, tiktok: null, x: null, linkedin: null },
}

const make = (
  opts: { store?: Record<string, unknown>; publications?: Array<Record<string, unknown>> } = {},
) => {
  const pubs = opts.publications ?? []
  const storesRepo = {
    findOne: jest.fn().mockResolvedValue(opts.store ?? draftStore),
    merge: jest.fn((s: Record<string, unknown>, patch: Record<string, unknown>) => ({
      ...s,
      ...patch,
    })),
    save: jest.fn(async (s: Record<string, unknown>) => s),
    update: jest.fn(),
  }
  const publicationsRepo = {
    findOne: jest.fn(
      async ({
        where,
        order,
      }: {
        where: { onlineStoreId: string; version?: number }
        order?: { version?: string }
      }) => {
        const rows = pubs.filter(
          (p) =>
            p.onlineStoreId === where.onlineStoreId &&
            (where.version === undefined || p.version === where.version),
        )
        if (order?.version === 'DESC')
          return [...rows].sort((a, b) => (b.version as number) - (a.version as number))[0] ?? null
        return rows[0] ?? null
      },
    ),
    find: jest.fn(async () =>
      [...pubs].sort((a, b) => (b.version as number) - (a.version as number)),
    ),
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(async (x: Record<string, unknown>) => {
      pubs.push(x)
      return { id: 'pub', ...x }
    }),
  }
  const noop = { find: jest.fn(), findOne: jest.fn() }
  const i18n = { translate: jest.fn(async (k: string) => k) }
  const logger = { setContext: jest.fn() }
  const service = new OnlineStoreService(
    storesRepo as any,
    publicationsRepo as any,
    noop as any,
    noop as any,
    noop as any,
    noop as any,
    i18n as any,
    logger as any,
  )
  return { service, storesRepo, publicationsRepo }
}

describe('OnlineStoreService — publish snapshots', () => {
  it('publishStore writes a v1 snapshot and clears the dirty flag', async () => {
    const { service, storesRepo, publicationsRepo } = make()
    const result = await service.publishStore('biz-1', { id: 'u1', name: 'Amah' })
    expect(publicationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, onlineStoreId: 'store-1', publishedById: 'u1' }),
    )
    expect(storesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', hasUnpublishedChanges: false }),
    )
    expect(result.status).toBe('published')
  })

  it('getPublishedStore returns null for a store with no published row', async () => {
    const { service, storesRepo } = make()
    storesRepo.findOne.mockResolvedValueOnce(null)
    expect(await service.getPublishedStore('akwa')).toBeNull()
  })

  it('getPublishedStore returns the latest snapshot config', async () => {
    const { service } = make({
      store: { ...draftStore, status: 'published' },
      publications: [{ onlineStoreId: 'store-1', version: 1, config: fullConfig }],
    })
    const res = await service.getPublishedStore('akwa')
    expect(res?.config.storeName).toBe('Old name')
  })

  it('restorePublication republishes an old version as a new version (with sourceVersion)', async () => {
    const { service, publicationsRepo } = make({
      publications: [{ onlineStoreId: 'store-1', version: 1, config: fullConfig }],
    })
    await service.restorePublication('biz-1', 1, { id: 'u1', name: 'Amah' })
    expect(publicationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2, sourceVersion: 1 }),
    )
  })
})
