import { beforeAll, describe, expect, it } from 'vitest'
import { TOLERANCE_SECONDS } from '../src/signature'
import { VARIANTS, VARIANT_NAMES, type Behaviour, type Variant } from '../src/variants'
import {
  balanceOf,
  migrate,
  newSecret,
  nowSeconds,
  problemType,
  provisionTenant,
  signed,
} from './helpers'

/**
 * The deliberately wrong versions of the reference partner.
 *
 * Each test shows the one bug doing what it is named for, and then shows what
 * the version still gets right — because a version that was wrong in two ways
 * would send whoever is reading a red case to the wrong place.
 */

beforeAll(migrate)

const ref = () => 'r-' + crypto.randomUUID()

async function setup(variant: Variant) {
  const tenant = await provisionTenant(variant)
  const [member] = tenant.members
  const send = (path: string, body: unknown, options = {}) =>
    signed(tenant, 'POST', path, { body, ...options })
  return { tenant, member, send, balance: () => balanceOf(tenant, member.id) }
}

type Tx = { transactionId: string; balance: number }

describe('the variant list', () => {
  it('has `correct` with every behaviour on, and no other version with all of them', () => {
    expect(Object.values(VARIANTS.correct).every(Boolean)).toBe(true)
  })

  it('makes every other version differ from `correct` in exactly one behaviour', () => {
    const flags = Object.keys(VARIANTS.correct) as (keyof Behaviour)[]
    for (const name of VARIANT_NAMES.filter((n) => n !== 'correct')) {
      const different = flags.filter((flag) => VARIANTS[name][flag] !== VARIANTS.correct[flag])
      expect({ name, different: different.length }).toEqual({ name, different: 1 })
    }
  })

  it('turns each behaviour off in exactly one version', () => {
    const flags = Object.keys(VARIANTS.correct) as (keyof Behaviour)[]
    for (const flag of flags) {
      const off = VARIANT_NAMES.filter((name) => !VARIANTS[name][flag])
      expect({ flag, versions: off.length }).toEqual({ flag, versions: 1 })
    }
  })

  it('does not take a property every object has for a version', async () => {
    const { tenant, member } = await setup('correct')
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const response = await signed({ ...tenant, variant: name }, 'GET', `/members/${member.id}`)
      expect({ name, status: response.status }).toEqual({ name, status: 404 })
    }
  })

  it('lists the thirteen versions the suite is documented against', () => {
    expect([...VARIANT_NAMES].sort()).toEqual(
      [
        'accepts-stale',
        'correct',
        'double-earn',
        'double-redeem',
        'double-reversal',
        'ignores-signature',
        'missing-tier',
        'no-replay-guard',
        'off-by-one',
        'overdraws',
        'plain-errors',
        'slow-balance',
        'unvalidated-points',
      ].sort(),
    )
  })
})

describe('ignores-signature', () => {
  it('accepts a request with no signature, a wrong one, and a body changed after signing', async () => {
    const { tenant, member, send, balance } = await setup('ignores-signature')
    const path = `/members/${member.id}`
    expect((await signed(tenant, 'GET', path, { omit: 'signature' })).status).toBe(200)
    expect((await signed(tenant, 'GET', path, { secret: newSecret() })).status).toBe(200)

    const tampered = await send(
      '/points/earn',
      { memberId: member.id, points: 10, reference: ref() },
      { tamper: (body: string) => body.replace('"points":10', '"points":900') },
    )
    expect(tampered.status).toBe(200)
    expect(await balance()).toBe(1900)
  })

  it('still refuses a stale timestamp, a replayed id and a request with no id', async () => {
    const { tenant, member } = await setup('ignores-signature')
    const path = `/members/${member.id}`
    const stale = await signed(tenant, 'GET', path, {
      timestamp: String(nowSeconds() - TOLERANCE_SECONDS - 60),
    })
    expect(stale.status).toBe(401)
    expect(await problemType(stale)).toBe('stale-timestamp')

    const options = { id: 'msg_' + crypto.randomUUID() }
    expect((await signed(tenant, 'GET', path, options)).status).toBe(200)
    expect((await signed(tenant, 'GET', path, options)).status).toBe(409)
    expect((await signed(tenant, 'GET', path, { omit: 'id' })).status).toBe(401)
  })
})

describe('accepts-stale', () => {
  it('accepts a correctly signed request from a long time ago', async () => {
    const { tenant, member } = await setup('accepts-stale')
    const response = await signed(tenant, 'GET', `/members/${member.id}`, {
      timestamp: String(nowSeconds() - 3600),
    })
    expect(response.status).toBe(200)
  })

  it('still refuses a wrong signature, with or without a stale timestamp', async () => {
    const { tenant, member } = await setup('accepts-stale')
    const path = `/members/${member.id}`
    expect((await signed(tenant, 'GET', path, { secret: newSecret() })).status).toBe(401)
    const both = await signed(tenant, 'GET', path, {
      secret: newSecret(),
      timestamp: String(nowSeconds() - 3600),
    })
    expect(both.status).toBe(401)
  })
})

describe('no-replay-guard', () => {
  it('accepts the same request twice, and applies it twice', async () => {
    const { tenant, member, balance } = await setup('no-replay-guard')
    const options = {
      body: { memberId: member.id, points: 100, reference: ref() },
      id: 'msg_' + crypto.randomUUID(),
      timestamp: String(nowSeconds()),
    }
    expect((await signed(tenant, 'POST', '/points/earn', options)).status).toBe(200)
    expect((await signed(tenant, 'POST', '/points/earn', options)).status).toBe(200)
    // The second is the same earn, so the reference answers it: the bug is the
    // missing replay check, not a second earn.
    expect(await balance()).toBe(1100)
  })

  it('still refuses a bad signature and a stale timestamp', async () => {
    const { tenant, member } = await setup('no-replay-guard')
    const path = `/members/${member.id}`
    expect((await signed(tenant, 'GET', path, { secret: newSecret() })).status).toBe(401)
    const stale = { timestamp: String(nowSeconds() - TOLERANCE_SECONDS - 60) }
    expect((await signed(tenant, 'GET', path, stale)).status).toBe(401)
  })
})

describe('double-earn', () => {
  it('earns again for a repeated reference', async () => {
    const { member, send, balance } = await setup('double-earn')
    const body = { memberId: member.id, points: 100, reference: ref() }
    const first = await (await send('/points/earn', body)).json<Tx>()
    const second = await (await send('/points/earn', body)).json<Tx>()
    expect(second.transactionId).not.toBe(first.transactionId)
    expect(second.balance).toBe(1200)
    expect(await balance()).toBe(1200)
  })

  it('still dedupes a repeated redemption and refuses a reference reused for another payload', async () => {
    const { member, send, balance } = await setup('double-earn')
    const redeem = { memberId: member.id, points: 100, reference: ref() }
    const first = await (await send('/points/redeem', redeem)).json<Tx>()
    const again = await (await send('/points/redeem', redeem)).json<Tx>()
    expect(again.transactionId).toBe(first.transactionId)
    expect(await balance()).toBe(900)

    const conflict = await send('/points/redeem', { ...redeem, points: 5 })
    expect(conflict.status).toBe(409)
  })

  it('still reverses once, and reads the reversal back as what it reversed', async () => {
    const { member, send } = await setup('double-earn')
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 100, reference: ref() })
    ).json<Tx>()
    const reversal = await (
      await send('/points/reversals', { transactionId: earned.transactionId, reference: ref() })
    ).json<Tx & { reverses: string }>()
    expect(reversal.reverses).toBe(earned.transactionId)
    const again = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference: ref(),
    })
    expect(again.status).toBe(409)
  })
})

describe('overdraws', () => {
  it('lets a redemption take the balance below zero', async () => {
    const { member, send, balance } = await setup('overdraws')
    const response = await send('/points/redeem', {
      memberId: member.id,
      points: 1001,
      reference: ref(),
    })
    expect(response.status).toBe(200)
    expect(await balance()).toBe(-1)
  })

  it('still refuses to reverse an earn whose points were spent, and dedupes a repeat', async () => {
    const { member, send } = await setup('overdraws')
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 200, reference: ref() })
    ).json<Tx>()
    await send('/points/redeem', { memberId: member.id, points: 1200, reference: ref() })
    const reversal = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference: ref(),
    })
    expect(reversal.status).toBe(422)

    const body = { memberId: member.id, points: 5, reference: ref() }
    const first = await (await send('/points/redeem', body)).json<Tx>()
    expect((await (await send('/points/redeem', body)).json<Tx>()).transactionId).toBe(
      first.transactionId,
    )
  })
})

describe('double-reversal', () => {
  it('reverses the same transaction twice, taking the points back twice', async () => {
    const { member, send, balance } = await setup('double-reversal')
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 100, reference: ref() })
    ).json<Tx>()
    for (const n of [1, 2]) {
      const response = await send('/points/reversals', {
        transactionId: earned.transactionId,
        reference: ref(),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ reverses: earned.transactionId, points: 100 })
      expect(await balance()).toBe(1100 - 100 * n)
    }
  })

  it('still answers a repeated reversal request with the original, and refuses to reverse a reversal', async () => {
    const { member, send } = await setup('double-reversal')
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 100, reference: ref() })
    ).json<Tx>()
    const reference = ref()
    const first = await (
      await send('/points/reversals', { transactionId: earned.transactionId, reference })
    ).json<Tx>()
    const repeat = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference,
    })
    expect(await repeat.json()).toEqual(first)

    const onReversal = await send('/points/reversals', {
      transactionId: first.transactionId,
      reference: ref(),
    })
    expect(onReversal.status).toBe(422)
  })
})

describe('plain-errors', () => {
  it('answers an unknown member in plain text, for a read and for an earn', async () => {
    const { tenant, send } = await setup('plain-errors')
    const read = await signed(tenant, 'GET', '/members/mbr_nobody')
    expect(read.status).toBe(404)
    expect(read.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(await read.text()).toBe('Member not found')

    const earn = await send('/points/earn', { memberId: 'mbr_nobody', points: 1, reference: ref() })
    expect(earn.status).toBe(404)
    expect(earn.headers.get('content-type')).toMatch(/^text\/plain/)
  })

  it('still answers every other error as a problem document', async () => {
    const { tenant, member, send } = await setup('plain-errors')
    const invalid = await send('/points/earn', { memberId: member.id, points: 0, reference: ref() })
    expect(invalid.headers.get('content-type')).toBe('application/problem+json')
    const noTransaction = await send('/points/reversals', {
      transactionId: 'txn_nothing',
      reference: ref(),
    })
    expect(noTransaction.status).toBe(404)
    expect(await problemType(noTransaction)).toBe('transaction-not-found')
    const unsigned = await signed(tenant, 'GET', `/members/${member.id}`, { omit: 'signature' })
    expect(await problemType(unsigned)).toBe('missing-signature')
  })
})

describe('slow-balance', () => {
  it('holds a balance read until the caller gives up', async () => {
    const { tenant, member } = await setup('slow-balance')
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 150)
    const began = Date.now()
    await signed(tenant, 'GET', `/members/${member.id}/balance`, { signal: controller.signal })
    expect(Date.now() - began).toBeGreaterThanOrEqual(140)
  })

  it('answers everything else at once, and the balance is right once it does answer', async () => {
    const { tenant, member, send } = await setup('slow-balance')
    const began = Date.now()
    expect((await signed(tenant, 'GET', `/members/${member.id}`)).status).toBe(200)
    const earned = await send('/points/earn', { memberId: member.id, points: 50, reference: ref() })
    expect(await earned.json()).toMatchObject({ balance: 1050 })
    expect(Date.now() - began).toBeLessThan(3000)
  })

  it('answers a balance read that was already abandoned, rather than waiting', async () => {
    const { tenant, member } = await setup('slow-balance')
    const controller = new AbortController()
    controller.abort()
    const began = Date.now()
    await signed(tenant, 'GET', `/members/${member.id}/balance`, {
      signal: controller.signal,
    }).catch(() => undefined)
    expect(Date.now() - began).toBeLessThan(3000)
  })
})

describe('missing-tier', () => {
  it('returns a member without a tier', async () => {
    const { tenant, member } = await setup('missing-tier')
    const response = await signed(tenant, 'GET', `/members/${member.id}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: member.id, name: 'Member A' })
  })

  it('still answers an unknown member as a problem, and a balance as before', async () => {
    const { tenant, balance } = await setup('missing-tier')
    const unknown = await signed(tenant, 'GET', '/members/mbr_nobody')
    expect(await problemType(unknown)).toBe('member-not-found')
    expect(await balance()).toBe(1000)
  })
})

describe('off-by-one', () => {
  it('credits one point fewer than an earn asked for, and says what the balance is', async () => {
    const { member, send, balance } = await setup('off-by-one')
    const response = await send('/points/earn', {
      memberId: member.id,
      points: 100,
      reference: ref(),
    })
    expect(await response.json()).toMatchObject({ type: 'earn', points: 100, balance: 1099 })
    expect(await balance()).toBe(1099)
  })

  it('takes one point fewer than a redemption asked for', async () => {
    const { member, send, balance } = await setup('off-by-one')
    const response = await send('/points/redeem', {
      memberId: member.id,
      points: 100,
      reference: ref(),
    })
    expect(await response.json()).toMatchObject({ type: 'redeem', points: 100, balance: 901 })
    expect(await balance()).toBe(901)
  })

  it('moves nothing for a single point, and still records the point asked', async () => {
    const { member, send, balance } = await setup('off-by-one')
    const response = await send('/points/earn', {
      memberId: member.id,
      points: 1,
      reference: ref(),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ points: 1, balance: 1000 })
    expect(await balance()).toBe(1000)
  })

  it('still takes back all of what was asked when it reverses an earn', async () => {
    const { member, send, balance } = await setup('off-by-one')
    const earned = await (
      await send('/points/earn', { memberId: member.id, points: 100, reference: ref() })
    ).json<Tx>()
    const reversal = await send('/points/reversals', {
      transactionId: earned.transactionId,
      reference: ref(),
    })
    expect(await reversal.json()).toMatchObject({ points: 100, balance: 999 })
    expect(await balance()).toBe(999)
  })

  it('still dedupes a repeated reference, and still refuses a redemption over the balance', async () => {
    const { member, send, balance } = await setup('off-by-one')
    const body = { memberId: member.id, points: 100, reference: ref() }
    const first = await (await send('/points/earn', body)).json<Tx>()
    const again = await (await send('/points/earn', body)).json<Tx>()
    expect(again.transactionId).toBe(first.transactionId)
    expect(await balance()).toBe(1099)

    const over = await send('/points/redeem', {
      memberId: member.id,
      points: 1100,
      reference: ref(),
    })
    expect(over.status).toBe(422)
    expect(await balance()).toBe(1099)
  })
})

describe('unvalidated-points', () => {
  it('answers zero points and negative points with a 500, and moves nothing', async () => {
    const { member, send, balance } = await setup('unvalidated-points')
    const earn = await send('/points/earn', { memberId: member.id, points: 0, reference: ref() })
    expect(earn.status).toBe(500)
    const redeem = await send('/points/redeem', {
      memberId: member.id,
      points: -5,
      reference: ref(),
    })
    expect(redeem.status).toBe(500)
    expect(await balance()).toBe(1000)
  })

  it('still refuses what is not a number, a missing reference and a missing member', async () => {
    const { member, send } = await setup('unvalidated-points')
    const notANumber = await send('/points/earn', {
      memberId: member.id,
      points: '10',
      reference: ref(),
    })
    expect(notANumber.status).toBe(400)
    expect((await send('/points/earn', { memberId: member.id, points: 10 })).status).toBe(400)
    expect((await send('/points/earn', { points: 10, reference: ref() })).status).toBe(400)
  })

  it('still earns and redeems valid points exactly', async () => {
    const { member, send, balance } = await setup('unvalidated-points')
    // Checked after each step: an earn one short and a redemption one short
    // cancel out, and a check at the end alone would pass them.
    await send('/points/earn', { memberId: member.id, points: 100, reference: ref() })
    expect(await balance()).toBe(1100)
    await send('/points/redeem', { memberId: member.id, points: 30, reference: ref() })
    expect(await balance()).toBe(1070)
  })
})

describe('double-redeem', () => {
  it('takes the points again for a repeated reference', async () => {
    const { member, send, balance } = await setup('double-redeem')
    const body = { memberId: member.id, points: 100, reference: ref() }
    const first = await (await send('/points/redeem', body)).json<Tx>()
    const second = await (await send('/points/redeem', body)).json<Tx>()
    expect(second.transactionId).not.toBe(first.transactionId)
    expect(second.balance).toBe(800)
    expect(await balance()).toBe(800)
  })

  it('still dedupes a repeated earn, and still refuses a redemption over the balance', async () => {
    const { member, send, balance } = await setup('double-redeem')
    const earn = { memberId: member.id, points: 100, reference: ref() }
    const first = await (await send('/points/earn', earn)).json<Tx>()
    const again = await (await send('/points/earn', earn)).json<Tx>()
    expect(again.transactionId).toBe(first.transactionId)
    expect(await balance()).toBe(1100)

    const over = await send('/points/redeem', {
      memberId: member.id,
      points: 1101,
      reference: ref(),
    })
    expect(over.status).toBe(422)
  })
})
