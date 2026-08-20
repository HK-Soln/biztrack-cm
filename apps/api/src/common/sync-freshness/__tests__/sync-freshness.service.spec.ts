import { SyncFreshnessService, SYNC_FRESHNESS_STALE_HOURS } from '../sync-freshness.service'

describe('SyncFreshnessService.isStale', () => {
  // isStale is pure (no repo access), so the repo can be null here.
  const service = new SyncFreshnessService(null as never)
  const now = new Date('2026-08-20T12:00:00Z')
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)

  it('treats a business with no device sessions as fresh (cloud-only / brand new)', () => {
    expect(service.isStale(null, SYNC_FRESHNESS_STALE_HOURS, now)).toBe(false)
  })

  it('is fresh when the last sync is within the threshold', () => {
    expect(
      service.isStale(hoursAgo(SYNC_FRESHNESS_STALE_HOURS - 1), SYNC_FRESHNESS_STALE_HOURS, now),
    ).toBe(false)
  })

  it('is stale when the last sync is older than the threshold', () => {
    expect(
      service.isStale(hoursAgo(SYNC_FRESHNESS_STALE_HOURS + 1), SYNC_FRESHNESS_STALE_HOURS, now),
    ).toBe(true)
  })
})
