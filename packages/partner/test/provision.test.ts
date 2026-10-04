import { beforeAll, describe, expect, it } from 'vitest'
import {
  PROVISION_TOKEN,
  balanceOf,
  call,
  migrate,
  newSecret,
  provisionTenant,
  signed,
} from './helpers'

beforeAll(migrate)

const post = (body: unknown, token: string | null = PROVISION_TOKEN, bindings = {}) =>
  call(
    '/_provision',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    },
    bindings,
  )

const fresh = () => ({ tenant: 't-' + crypto.randomUUID(), secret: newSecret() })

describe('POST /_provision', () => {
  it('creates a tenant with two members holding the starting balance', async () => {
    const response = await post(fresh())
    expect(response.status).toBe(201)
    const body = await response.json<{ members: { balance: number; id: string }[] }>()
    expect(body.members).toHaveLength(2)
    expect(body.members.map((m) => m.balance)).toEqual([1000, 1000])
    expect(body.members[0]!.id).not.toBe(body.members[1]!.id)
  })

  it('refuses without the token, or with a wrong one', async () => {
    expect((await post(fresh(), null)).status).toBe(401)
    expect((await post(fresh(), 'wrong-token')).status).toBe(401)
    expect((await post(fresh(), PROVISION_TOKEN + 'x')).status).toBe(401)
  })

  it('is off, rather than open, when no token is configured', async () => {
    const response = await post(fresh(), PROVISION_TOKEN, { PROVISION_TOKEN: undefined })
    expect(response.status).toBe(503)
  })

  it('refuses a malformed tenant id or a short or foreign secret', async () => {
    const { secret } = fresh()
    expect((await post({ tenant: 'UPPER-case-id', secret })).status).toBe(400)
    expect((await post({ tenant: 'short', secret })).status).toBe(400)
    const tenant = 't-' + crypto.randomUUID()
    expect((await post({ tenant, secret: 'whsec_' + btoa('too short') })).status).toBe(400)
    expect((await post({ tenant, secret: secret.replace('whsec_', 'sk_') })).status).toBe(400)
  })

  /**
   * The rule that keeps the suite honest: provisioning cannot be used as a
   * reset. If it could, the suite could put a balance right after a run by
   * re-provisioning, which no real partner would let it do.
   */
  it('refuses an existing tenant and leaves its balances where they were', async () => {
    const tenant = await provisionTenant()
    const [member] = tenant.members
    const spent = await signed(tenant, 'POST', '/points/redeem', {
      body: { memberId: member.id, points: 300, reference: 'r-' + crypto.randomUUID() },
    })
    expect(spent.status).toBe(200)

    const again = await post({ tenant: tenant.id, secret: newSecret() })
    expect(again.status).toBe(409)
    expect(await balanceOf(tenant, member.id)).toBe(700)

    // And the original secret still works, so nothing about the tenant moved.
    const check = await signed(tenant, 'GET', `/members/${member.id}`)
    expect(check.status).toBe(200)
  })
})
