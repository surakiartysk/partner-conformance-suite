import { beforeAll, describe, expect, it } from 'vitest'
import { balanceOf, migrate, problemType, provisionTenant, signed } from './helpers'

beforeAll(migrate)

type Tx = { transactionId: string; type: string; points: number; balance: number }

const ref = () => 'r-' + crypto.randomUUID()

async function setup() {
  const tenant = await provisionTenant()
  const member = tenant.members[0]
  const send = (path: string, body: unknown) => signed(tenant, 'POST', path, { body })
  const balance = () => balanceOf(tenant, member.id)
  return { tenant, member, send, balance }
}

describe('POST /points/earn', () => {
  it('adds the points and reports the balance after', async () => {
    const { member, send, balance } = await setup()
    const response = await send('/points/earn', {
      memberId: member.id,
      points: 150,
      reference: ref(),
    })
    expect(response.status).toBe(200)
    const tx = await response.json<Tx>()
    expect(tx).toMatchObject({ type: 'earn', memberId: member.id, points: 150, balance: 1150 })
    expect(tx.transactionId).toMatch(/^txn_/)
    expect(await balance()).toBe(1150)
  })

  it('answers a repeated reference with the original transaction, adding nothing', async () => {
    const { member, send, balance } = await setup()
    const body = { memberId: member.id, points: 100, reference: ref() }
    const first = await (await send('/points/earn', body)).json<Tx>()
    const second = await send('/points/earn', body)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(first)
    expect(await balance()).toBe(1100)
  })

  it('answers a repeat with the balance as it stood then, not now', async () => {
    const { member, send } = await setup()
    const body = { memberId: member.id, points: 100, reference: ref() }
    await send('/points/earn', body)
    await send('/points/redeem', { memberId: member.id, points: 50, reference: ref() })
    const repeat = await (await send('/points/earn', body)).json<Tx>()
    expect(repeat.balance).toBe(1100)
  })

  it('refuses a reference reused with a different payload', async () => {
    const { member, send, balance } = await setup()
    const reference = ref()
    await send('/points/earn', { memberId: member.id, points: 100, reference })
    const conflict = await send('/points/earn', { memberId: member.id, points: 999, reference })
    expect(conflict.status).toBe(409)
    expect(await problemType(conflict)).toBe('reference-conflict')
    expect(await balance()).toBe(1100)
  })

  it('refuses a reference already used by a different operation', async () => {
    const { member, send } = await setup()
    const reference = ref()
    await send('/points/earn', { memberId: member.id, points: 100, reference })
    const response = await send('/points/redeem', { memberId: member.id, points: 100, reference })
    expect(response.status).toBe(409)
    expect(await problemType(response)).toBe('reference-conflict')
  })

  it.each([0, -5, 1.5, '10', null, 1_000_001])('refuses points of %j', async (points) => {
    const { member, send, balance } = await setup()
    const response = await send('/points/earn', { memberId: member.id, points, reference: ref() })
    expect(response.status).toBe(400)
    expect(await problemType(response)).toBe('invalid-request')
    expect(await balance()).toBe(1000)
  })

  it('refuses a missing or overlong reference, and a body that is not an object', async () => {
    const { member, send } = await setup()
    expect((await send('/points/earn', { memberId: member.id, points: 1 })).status).toBe(400)
    const long = 'x'.repeat(65)
    expect(
      (await send('/points/earn', { memberId: member.id, points: 1, reference: long })).status,
    ).toBe(400)
    // `null` is valid JSON with no fields to read: unchecked, it reaches the
    // destructuring and becomes a 500.
    expect((await send('/points/earn', null)).status).toBe(400)
    expect((await send('/points/earn', [member.id, 1])).status).toBe(400)
  })

  it('answers an unknown member with 404', async () => {
    const { send } = await setup()
    const response = await send('/points/earn', {
      memberId: 'mbr_nobody',
      points: 1,
      reference: ref(),
    })
    expect(response.status).toBe(404)
    expect(await problemType(response)).toBe('member-not-found')
  })

  it('applies one of two identical requests racing each other', async () => {
    const { member, send, balance } = await setup()
    const body = { memberId: member.id, points: 100, reference: ref() }
    const responses = await Promise.all([send('/points/earn', body), send('/points/earn', body)])
    expect(responses.map((r) => r.status)).toEqual([200, 200])
    const [a, b] = await Promise.all(responses.map((r) => r.json<Tx>()))
    expect(a!.transactionId).toBe(b!.transactionId)
    expect(await balance()).toBe(1100)
  })
})

describe('POST /points/redeem', () => {
  it('takes the points', async () => {
    const { member, send, balance } = await setup()
    const response = await send('/points/redeem', {
      memberId: member.id,
      points: 400,
      reference: ref(),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ type: 'redeem', points: 400, balance: 600 })
    expect(await balance()).toBe(600)
  })

  it('can take the whole balance, and not a point more', async () => {
    const { member, send, balance } = await setup()
    const over = await send('/points/redeem', {
      memberId: member.id,
      points: 1001,
      reference: ref(),
    })
    expect(over.status).toBe(422)
    expect(await problemType(over)).toBe('insufficient-points')
    expect(await balance()).toBe(1000)

    const all = await send('/points/redeem', {
      memberId: member.id,
      points: 1000,
      reference: ref(),
    })
    expect(all.status).toBe(200)
    expect(await balance()).toBe(0)
  })

  /**
   * The lookup before applying is what answers this one. Without it the
   * request would be tried again, fail the balance guard, and come back as
   * insufficient points instead of the redemption that already happened.
   */
  it('answers a repeat with the original even when the balance could no longer cover it', async () => {
    const { member, send, balance } = await setup()
    const body = { memberId: member.id, points: 1000, reference: ref() }
    const first = await (await send('/points/redeem', body)).json<Tx>()
    const repeat = await send('/points/redeem', body)
    expect(repeat.status).toBe(200)
    expect(await repeat.json()).toEqual(first)
    expect(await balance()).toBe(0)
  })

  /**
   * The case a read-then-write gets wrong: both requests read 1,000, both
   * decide there is enough, both subtract. Here one of them must lose.
   */
  it('lets only one of two redemptions of the whole balance through', async () => {
    const { member, send, balance } = await setup()
    const redeem = () =>
      send('/points/redeem', { memberId: member.id, points: 1000, reference: ref() })
    const statuses = (await Promise.all([redeem(), redeem()])).map((r) => r.status).sort()
    expect(statuses).toEqual([200, 422])
    expect(await balance()).toBe(0)
  })
})

describe('POST /points/reversals', () => {
  it('undoes an earn', async () => {
    const { member, send, balance } = await setup()
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 200, reference: ref() })
    ).json<Tx>()
    const response = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference: ref(),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      type: 'reversal',
      points: 200,
      balance: 1000,
      reverses: earned.transactionId,
    })
    expect(await balance()).toBe(1000)
  })

  it('undoes a redemption', async () => {
    const { member, send, balance } = await setup()
    const spent = await (
      await send('/points/redeem', { memberId: member.id, points: 300, reference: ref() })
    ).json<Tx>()
    await send('/points/reversals', { transactionId: spent.transactionId, reference: ref() })
    expect(await balance()).toBe(1000)
  })

  it('reverses a transaction once, however it is asked again', async () => {
    const { member, send, balance } = await setup()
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 200, reference: ref() })
    ).json<Tx>()
    const reference = ref()
    const first = await (
      await send('/points/reversals', { transactionId: earned.transactionId, reference })
    ).json<Tx>()

    // The same request again is a repeat, and gets the same answer.
    const repeat = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference,
    })
    expect(await repeat.json()).toEqual(first)

    // A new reference asking for the same reversal is refused.
    const again = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference: ref(),
    })
    expect(again.status).toBe(409)
    expect(await problemType(again)).toBe('already-reversed')
    expect(await balance()).toBe(1000)
  })

  it('says already reversed, not insufficient points, when both would be true', async () => {
    const { member, send } = await setup()
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 200, reference: ref() })
    ).json<Tx>()
    await send('/points/reversals', { transactionId: earned.transactionId, reference: ref() })
    await send('/points/redeem', { memberId: member.id, points: 1000, reference: ref() })
    const again = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference: ref(),
    })
    expect(again.status).toBe(409)
    expect(await problemType(again)).toBe('already-reversed')
  })

  it('lets only one of two different reversals racing each other through', async () => {
    const { member, send, balance } = await setup()
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 200, reference: ref() })
    ).json<Tx>()
    const reverse = () =>
      send('/points/reversals', { transactionId: earned.transactionId, reference: ref() })
    const statuses = (await Promise.all([reverse(), reverse()])).map((r) => r.status).sort()
    expect(statuses).toEqual([200, 409])
    expect(await balance()).toBe(1000)
  })

  it('refuses to reverse an earn whose points have been spent', async () => {
    const { member, send, balance } = await setup()
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 200, reference: ref() })
    ).json<Tx>()
    await send('/points/redeem', { memberId: member.id, points: 1200, reference: ref() })
    const response = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference: ref(),
    })
    expect(response.status).toBe(422)
    expect(await problemType(response)).toBe('insufficient-points')
    expect(await balance()).toBe(0)
  })

  it('refuses to reverse a reversal', async () => {
    const { member, send } = await setup()
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 200, reference: ref() })
    ).json<Tx>()
    const reversal = await (
      await send('/points/reversals', { transactionId: earned.transactionId, reference: ref() })
    ).json<Tx>()
    const response = await send('/points/reversals', {
      transactionId: reversal.transactionId,
      reference: ref(),
    })
    expect(response.status).toBe(422)
    expect(await problemType(response)).toBe('not-reversible')
  })

  it("answers an unknown transaction, or another tenant's, with 404", async () => {
    const { send } = await setup()
    const missing = await send('/points/reversals', {
      transactionId: 'txn_nothing',
      reference: ref(),
    })
    expect(missing.status).toBe(404)
    expect(await problemType(missing)).toBe('transaction-not-found')

    const other = await setup()
    const theirs = await (
      await other.send('/points/earn', {
        memberId: other.member.id,
        points: 10,
        reference: ref(),
      })
    ).json<Tx>()
    const response = await send('/points/reversals', {
      transactionId: theirs.transactionId,
      reference: ref(),
    })
    expect(response.status).toBe(404)
  })
})
