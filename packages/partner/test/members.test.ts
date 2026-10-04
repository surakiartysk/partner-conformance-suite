import { beforeAll, describe, expect, it } from 'vitest'
import { migrate, problemType, provisionTenant, signed } from './helpers'

beforeAll(migrate)

describe('GET /members/{memberId}', () => {
  it('returns the member as the spec shapes it', async () => {
    const tenant = await provisionTenant()
    const member = tenant.members[1]
    const response = await signed(tenant, 'GET', `/members/${member.id}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: member.id, name: 'Member B', tier: 'gold' })
  })

  it('answers an unknown member with an RFC 9457 problem', async () => {
    const tenant = await provisionTenant()
    const response = await signed(tenant, 'GET', '/members/mbr_nobody')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await response.json()).toEqual({
      type: 'https://points-partner.example/problems/member-not-found',
      title: 'Member not found',
      status: 404,
    })
  })

  it("does not show another tenant's member", async () => {
    const [mine, theirs] = await Promise.all([provisionTenant(), provisionTenant()])
    const response = await signed(mine, 'GET', `/members/${theirs.members[0].id}`)
    expect(response.status).toBe(404)
    expect(await problemType(response)).toBe('member-not-found')
  })
})

describe('GET /members/{memberId}/balance', () => {
  it('returns the balance', async () => {
    const tenant = await provisionTenant()
    const member = tenant.members[0]
    const response = await signed(tenant, 'GET', `/members/${member.id}/balance`)
    expect(await response.json()).toEqual({ memberId: member.id, balance: 1000 })
  })

  it('answers an unknown member with 404', async () => {
    const tenant = await provisionTenant()
    const response = await signed(tenant, 'GET', '/members/mbr_nobody/balance')
    expect(response.status).toBe(404)
  })

  it("does not show another tenant's balance", async () => {
    const [mine, theirs] = await Promise.all([provisionTenant(), provisionTenant()])
    const response = await signed(mine, 'GET', `/members/${theirs.members[0].id}/balance`)
    expect(response.status).toBe(404)
    expect(await problemType(response)).toBe('member-not-found')
  })
})
