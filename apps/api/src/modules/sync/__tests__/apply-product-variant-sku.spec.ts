/// <reference types="jest" />
import { SyncService } from '../sync.service'

// Ruling R12: a variant arriving by sync gets the server's SKU rule, trimmed (none when
// blank) and unique among the business's live variants. Only the variants repo is wired;
// the refusal comes before anything is written.

const op = (payload: Record<string, unknown>) =>
  ({
    recordId: 'var-new',
    action: 'UPSERT',
    recordUpdatedAt: new Date('2026-10-16T08:00:00.000Z'),
    payload: { productId: 'prod-1', name: 'Red', ...payload },
  }) as any

const makeService = (holder: unknown) => {
  const repo = {
    // First lookup: the variant itself (new here); second: who holds the SKU.
    findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(holder),
    update: jest.fn(),
    save: jest.fn(async (e) => e),
    create: jest.fn((e) => e),
  }
  const service = Object.create(SyncService.prototype) as any
  service.productVariantsRepo = repo
  return { service, repo }
}

describe('SyncService.applyProductVariantOperation — variant SKU (R12)', () => {
  it('refuses a SKU another live variant holds', async () => {
    const { service, repo } = makeService({ id: 'var-other', sku: 'TS-RED' })

    await expect(
      service.applyProductVariantOperation('biz-1', op({ sku: ' TS-RED ' })),
    ).rejects.toMatchObject({ code: 'VARIANT_DUPLICATE_SKU' })
    expect(repo.findOne).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ businessId: 'biz-1', sku: 'TS-RED' }),
    })
    expect(repo.save).not.toHaveBeenCalled()
  })
})
