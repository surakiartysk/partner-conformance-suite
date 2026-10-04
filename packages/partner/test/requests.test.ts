import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TOLERANCE_SECONDS } from '../src/signature'
import {
  balanceOf,
  call,
  migrate,
  newSecret,
  nowSeconds,
  problemType,
  provisionTenant,
  signed,
} from './helpers'

/**
 * The path every request takes before it reaches an operation: variant,
 * tenant, signature, timestamp, replay. Driven through the Worker, so the
 * order of those checks is under test too.
 */

beforeAll(migrate)
afterEach(() => vi.useRealTimers())

const earnBody = (memberId: string, points = 10) => ({
  memberId,
  points,
  reference: 'r-' + crypto.randomUUID(),
})

describe('signature', () => {
  it('accepts a correctly signed request', async () => {
    const tenant = await provisionTenant()
    const response = await signed(tenant, 'GET', `/members/${tenant.members[0].id}`)
    expect(response.status).toBe(200)
  })

  it.each(['id', 'timestamp', 'signature'] as const)(
    'refuses a request missing webhook-%s as missing-signature',
    async (omit) => {
      const tenant = await provisionTenant()
      const response = await signed(tenant, 'GET', `/members/${tenant.members[0].id}`, { omit })
      expect(response.status).toBe(401)
      expect(await problemType(response)).toBe('missing-signature')
    },
  )

  it('refuses a request signed with another secret', async () => {
    const tenant = await provisionTenant()
    const response = await signed(tenant, 'GET', `/members/${tenant.members[0].id}`, {
      secret: newSecret(),
    })
    expect(response.status).toBe(401)
    expect(await problemType(response)).toBe('invalid-signature')
  })

  it("refuses one tenant's signature on another tenant's path", async () => {
    const [mine, theirs] = await Promise.all([provisionTenant(), provisionTenant()])
    const response = await signed(theirs, 'GET', `/members/${theirs.members[0].id}`, {
      secret: mine.secret,
    })
    expect(response.status).toBe(401)
  })

  it('refuses a body changed after signing, and moves no points', async () => {
    const tenant = await provisionTenant()
    const member = tenant.members[0]
    const response = await signed(tenant, 'POST', '/points/earn', {
      body: earnBody(member.id, 10),
      tamper: (body) => body.replace('"points":10', '"points":900'),
    })
    expect(response.status).toBe(401)
    expect(await problemType(response)).toBe('invalid-signature')
    expect(await balanceOf(tenant, member.id)).toBe(1000)
  })

  it('refuses a timestamp outside the tolerance, in either direction', async () => {
    const tenant = await provisionTenant()
    for (const offset of [-(TOLERANCE_SECONDS + 1), TOLERANCE_SECONDS + 1]) {
      const response = await signed(tenant, 'GET', `/members/${tenant.members[0].id}`, {
        timestamp: String(nowSeconds() + offset),
      })
      expect(response.status).toBe(401)
      expect(await problemType(response)).toBe('stale-timestamp')
    }
  })
})

describe('replay', () => {
  it('refuses a webhook-id it has already accepted, and applies the first only', async () => {
    const tenant = await provisionTenant()
    const member = tenant.members[0]
    // Signed once, sent twice: the second is a byte-for-byte copy.
    const options = {
      body: earnBody(member.id, 10),
      id: 'msg_' + crypto.randomUUID(),
      timestamp: String(nowSeconds()),
    }

    expect((await signed(tenant, 'POST', '/points/earn', options)).status).toBe(200)
    const replay = await signed(tenant, 'POST', '/points/earn', options)
    expect(replay.status).toBe(409)
    expect(await problemType(replay)).toBe('replayed-request')
    expect(await balanceOf(tenant, member.id)).toBe(1010)
  })

  it('does not let an unauthenticated request use up an id', async () => {
    const tenant = await provisionTenant()
    const id = 'msg_' + crypto.randomUUID()
    const path = `/members/${tenant.members[0].id}`
    const forged = await signed(tenant, 'GET', path, { id, secret: newSecret() })
    expect(forged.status).toBe(401)
    expect((await signed(tenant, 'GET', path, { id })).status).toBe(200)
  })

  it('keeps refusing ids within the window a future-dated timestamp stays valid', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const tenant = await provisionTenant()
    const start = nowSeconds()
    // Signed close to the tolerance ahead of the partner's clock.
    const options = { id: 'msg_' + crypto.randomUUID(), timestamp: String(start + 290) }
    const path = `/members/${tenant.members[0].id}`
    expect((await signed(tenant, 'GET', path, options)).status).toBe(200)

    // Seven minutes on, the timestamp is still within tolerance — 110 seconds
    // behind the clock — so only the remembered id stops the copy.
    vi.setSystemTime((start + 7 * 60) * 1000)
    const replay = await signed(tenant, 'GET', path, options)
    expect(replay.status).toBe(409)
  })
})

describe('routing', () => {
  it('answers an unknown variant or tenant with a problem document', async () => {
    const tenant = await provisionTenant()
    // A real member, so the 404 can only come from the variant.
    const path = `/members/${tenant.members[0].id}`
    const unknownVariant = await signed({ ...tenant, variant: 'nonexistent' }, 'GET', path)
    expect(unknownVariant.status).toBe(404)
    expect(unknownVariant.headers.get('content-type')).toBe('application/problem+json')
    expect(await problemType(unknownVariant)).toBe('not-found')

    const unknownTenant = await signed({ ...tenant, id: 't-missing-0000' }, 'GET', '/members/x')
    expect(unknownTenant.status).toBe(404)
    expect(await problemType(unknownTenant)).toBe('unknown-tenant')
  })

  it('treats an expired tenant as unknown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const tenant = await provisionTenant()
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1000)
    const response = await signed(tenant, 'GET', `/members/${tenant.members[0].id}`)
    expect(response.status).toBe(404)
    expect(await problemType(response)).toBe('unknown-tenant')
  })

  it('answers an unknown path with a problem document, not plain text', async () => {
    const response = await call('/nowhere')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
  })
})
