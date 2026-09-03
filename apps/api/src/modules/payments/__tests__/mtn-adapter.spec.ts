import { PaymentMethod } from '@biztrack/types'
import { MtnAdapter } from '../adapters/mtn.adapter'

/** Route mocked fetch by URL: token vs balance. */
function mockFetch(routes: { token?: unknown; balance?: unknown }) {
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes('/collection/token/')) return Promise.resolve(routes.token)
    if (String(url).includes('/collection/v1_0/account/balance'))
      return Promise.resolve(routes.balance)
    return Promise.reject(new Error(`unexpected url ${url}`))
  }) as unknown as typeof fetch
}

const ok = (json: unknown) => ({
  ok: true,
  status: 200,
  json: async () => json,
  // fetchToken reads res.text() then JSON.parses it, so text() must carry the JSON.
  text: async () => JSON.stringify(json),
})
const fail = (status: number) => ({ ok: false, status, text: async () => 'err' })

const GOOD = {
  subscription_key: 'sub',
  api_user: 'u-123456',
  api_key: 'key',
  environment: 'sandbox',
}

describe('MtnAdapter (MoMo Collection) — verifyCredentials', () => {
  // Fresh adapter per test so the per-api_user token cache never bleeds between cases.
  let adapter: MtnAdapter
  const realFetch = global.fetch
  beforeEach(() => {
    adapter = new MtnAdapter()
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  it('rejects incomplete credentials without a network call', async () => {
    const spy = jest.fn()
    global.fetch = spy as unknown as typeof fetch
    const res = await adapter.verifyCredentials({ subscription_key: 'sub' })
    expect(res.valid).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('valid when the Collection token succeeds, enabling MTN_MOMO', async () => {
    mockFetch({ token: ok({ access_token: 'tok', expires_in: 3600 }) })
    const res = await adapter.verifyCredentials(GOOD)
    expect(res.valid).toBe(true)
    expect(res.enabledMethods).toContain(PaymentMethod.MTN_MOMO)
  })

  it('invalid when the token is rejected — bad api user/key, or a non-Collection subscription key', async () => {
    mockFetch({ token: fail(401) })
    const res = await adapter.verifyCredentials(GOOD)
    expect(res.valid).toBe(false)
  })

  it('requires a base URL in production', async () => {
    const spy = jest.fn()
    global.fetch = spy as unknown as typeof fetch
    const res = await adapter.verifyCredentials({ ...GOOD, environment: 'production' })
    expect(res.valid).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('MtnAdapter (MoMo Collection) — execution', () => {
  let adapter: MtnAdapter
  const realFetch = global.fetch
  beforeEach(() => {
    adapter = new MtnAdapter()
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  const tokenOk = () => ok({ access_token: 'tok', expires_in: 3600 })
  const route = (impl: (url: string) => unknown) => {
    global.fetch = jest.fn((url: string) =>
      Promise.resolve(String(url).includes('/collection/token/') ? tokenOk() : impl(String(url))),
    ) as unknown as typeof fetch
  }

  it('initiateUssdPush posts requesttopay and returns PENDING + a reference', async () => {
    route(() => ({ ok: true, status: 202, text: async () => '' }))
    const res = await adapter.initiateUssdPush(GOOD, {
      amountMinor: 5000,
      currency: 'XAF',
      method: PaymentMethod.MTN_MOMO,
      customerPhone: '+237670000000',
      reference: 'ORD-1',
      idempotencyKey: 'k',
    })
    expect(res.status).toBe('PENDING')
    expect(res.providerRef).toMatch(/[0-9a-f-]{36}/)
  })

  it('getTransaction maps SUCCESSFUL → CONFIRMED', async () => {
    route(() => ok({ status: 'SUCCESSFUL', amount: '1000', currency: 'EUR' }))
    const state = await adapter.getTransaction(GOOD, 'ref-1')
    expect(state.status).toBe('CONFIRMED')
    expect(state.providerRef).toBe('ref-1')
  })

  it('getTransaction maps FAILED → FAILED', async () => {
    route(() => ok({ status: 'FAILED', reason: 'PAYER_NOT_FOUND' }))
    const state = await adapter.getTransaction(GOOD, 'ref-1')
    expect(state.status).toBe('FAILED')
  })

  it('getTransaction keeps PENDING while awaiting approval', async () => {
    route(() => ok({ status: 'PENDING' }))
    const state = await adapter.getTransaction(GOOD, 'ref-1')
    expect(state.status).toBe('PENDING')
  })
})
