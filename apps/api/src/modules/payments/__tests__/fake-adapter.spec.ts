import { PaymentMethod } from '@biztrack/types'
import { FakeProviderAdapter } from '../adapters/fake.adapter'
import { PaymentAdapterRegistry } from '../adapters/adapter.registry'

describe('FakeProviderAdapter + registry', () => {
  const mtn = new FakeProviderAdapter('MTN', [PaymentMethod.MTN_MOMO])

  it('verifies good credentials and reports the account methods', async () => {
    const res = await mtn.verifyCredentials({ subscription_key: 'ok', api_key: 'ok' })
    expect(res.valid).toBe(true)
    expect(res.enabledMethods).toEqual([PaymentMethod.MTN_MOMO])
  })

  it('rejects credentials containing "invalid"', async () => {
    const res = await mtn.verifyCredentials({ subscription_key: 'this-is-invalid' })
    expect(res.valid).toBe(false)
    expect(res.enabledMethods).toEqual([])
    expect(res.error).toBeTruthy()
  })

  it('parses a webhook body into a provider event', () => {
    const body = Buffer.from(
      JSON.stringify({ providerRef: 'r1', status: 'CONFIRMED', eventId: 'e1' }),
    )
    expect(mtn.parseWebhook(body)).toMatchObject({
      providerRef: 'r1',
      status: 'CONFIRMED',
      eventId: 'e1',
    })
  })

  it('registry resolves by code and returns null for the unknown', () => {
    const registry = new PaymentAdapterRegistry([mtn])
    expect(registry.get('MTN')).toBe(mtn)
    expect(registry.get('NOPE')).toBeNull()
  })
})
