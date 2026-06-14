/// <reference types="jest" />
import { Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm'
import { AuditService, buildAuditLog } from '../audit.service'

function makeService() {
  const auditRepo = {
    findAndCount: jest.fn(async (): Promise<[any[], number]> => [[], 0]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
  }
  const auditQueue = { add: jest.fn(async () => undefined) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const service = new AuditService(auditRepo as any, auditQueue as any, logger as any)
  return { service, auditRepo, auditQueue, logger }
}

// Safe first-call/first-arg readers (the project uses noUncheckedIndexedAccess).
const firstArg = (fn: { mock: { calls: unknown[][] } }): any => fn.mock.calls[0]?.[0] ?? {}
const callArgs = (fn: { mock: { calls: unknown[][] } }): any[] => (fn.mock.calls[0] ?? []) as any[]

const ctx = (over: Partial<Record<string, unknown>> = {}) =>
  ({ businessId: 'biz-1', actorId: 'user-1', actorType: 'USER', ...over }) as any

const data = () =>
  ({ action: 'CREATE', entityType: 'product', entityId: 'p1', entityLabel: 'Widget' }) as any

describe('AuditService.log (fire-and-forget)', () => {
  it('does nothing when the context has no businessId', () => {
    const { service, auditQueue } = makeService()
    service.log(ctx({ businessId: undefined }), data())
    expect(auditQueue.add).not.toHaveBeenCalled()
  })

  it('enqueues the audit job with retry options when a businessId is present', () => {
    const { service, auditQueue } = makeService()
    service.log(ctx(), data())
    expect(auditQueue.add).toHaveBeenCalledTimes(1)
    const [, payload, opts] = callArgs(auditQueue.add)
    expect(payload).toMatchObject({ context: { businessId: 'biz-1' }, data: { action: 'CREATE' } })
    expect(opts).toMatchObject({ attempts: 3 })
  })

  it('returns synchronously (never awaited by callers)', () => {
    const { service } = makeService()
    expect(service.log(ctx(), data())).toBeUndefined()
  })
})

describe('AuditService.query (scoping + filters)', () => {
  it('always scopes the query to the businessId', async () => {
    const { service, auditRepo } = makeService()
    await service.query('biz-1', {} as any)
    expect(firstArg(auditRepo.findAndCount).where).toMatchObject({ businessId: 'biz-1' })
  })

  it('applies entity/actor/action filters when provided', async () => {
    const { service, auditRepo } = makeService()
    await service.query('biz-1', {
      entityType: 'product',
      entityId: 'p1',
      actorId: 'u1',
      action: 'UPDATE',
    } as any)
    expect(firstArg(auditRepo.findAndCount).where).toMatchObject({
      businessId: 'biz-1',
      entityType: 'product',
      entityId: 'p1',
      actorId: 'u1',
      action: 'UPDATE',
    })
  })

  it('uses Between when both from and to are supplied', async () => {
    const { service, auditRepo } = makeService()
    await service.query('biz-1', { from: '2026-01-01', to: '2026-02-01' } as any)
    expect(firstArg(auditRepo.findAndCount).where.createdAt).toEqual(
      Between(new Date('2026-01-01'), new Date('2026-02-01')),
    )
  })

  it('uses MoreThanOrEqual with only from, LessThanOrEqual with only to', async () => {
    const a = makeService()
    await a.service.query('biz-1', { from: '2026-01-01' } as any)
    expect(firstArg(a.auditRepo.findAndCount).where.createdAt).toEqual(
      MoreThanOrEqual(new Date('2026-01-01')),
    )
    const b = makeService()
    await b.service.query('biz-1', { to: '2026-02-01' } as any)
    expect(firstArg(b.auditRepo.findAndCount).where.createdAt).toEqual(
      LessThanOrEqual(new Date('2026-02-01')),
    )
  })

  it('clamps limit to 200 and page to >= 1', async () => {
    const { service, auditRepo } = makeService()
    await service.query('biz-1', { page: 0, limit: 9999 } as any)
    const arg = firstArg(auditRepo.findAndCount)
    expect(arg.take).toBe(200)
    expect(arg.skip).toBe(0)
  })

  it('returns a paginated envelope', async () => {
    const { service, auditRepo } = makeService()
    auditRepo.findAndCount.mockResolvedValueOnce([[{ id: 'a1' }], 1])
    const result = await service.query('biz-1', { page: 1, limit: 50 } as any)
    expect(result).toMatchObject({ data: [{ id: 'a1' }], total: 1, page: 1, limit: 50, totalPages: 1 })
  })
})

describe('buildAuditLog', () => {
  it('maps context + data into a persistable row', () => {
    const row = buildAuditLog(ctx({ actorName: 'Jane', requestId: 'r1', deviceId: 'd1' }), data())
    expect(row).toMatchObject({
      businessId: 'biz-1',
      actorId: 'user-1',
      actorName: 'Jane',
      action: 'CREATE',
      entityType: 'product',
      entityId: 'p1',
      entityLabel: 'Widget',
      requestId: 'r1',
      deviceId: 'd1',
    })
  })

  it('defaults optional fields to null', () => {
    const row = buildAuditLog(ctx({ actorId: undefined }), {
      action: 'DELETE',
      entityType: 'sale',
      entityId: 's1',
    } as any)
    expect(row.actorId).toBeNull()
    expect(row.entityLabel).toBeNull()
    expect(row.changes).toBeNull()
    expect(row.requestId).toBeNull()
  })
})
