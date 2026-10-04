import { describe, expect, it } from 'vitest'
import { TOLERANCE_SECONDS, verify } from '../src/signature'
import { sign } from './helpers'

/**
 * The verifier against the standard itself.
 *
 * The vector is the one Standard Webhooks publishes. Passing it means this
 * side agrees with every other implementation of the standard — not merely
 * with a signer written in the same repository.
 */
const VECTOR = {
  secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
  timestamp: '1614265330',
  body: '{"test": 2432232314}',
  signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
}
const AT = Number(VECTOR.timestamp)

const headers = (overrides: Partial<typeof VECTOR> = {}) => {
  const v = { ...VECTOR, ...overrides }
  return { id: v.id, timestamp: v.timestamp, signature: v.signature }
}

describe('verify', () => {
  it('accepts the published test vector', async () => {
    expect(await verify(VECTOR.secret, headers(), VECTOR.body, AT)).toEqual({ ok: true })
  })

  it('and the test signer produces that same signature', async () => {
    expect(await sign(VECTOR.secret, VECTOR.id, VECTOR.timestamp, VECTOR.body)).toBe(
      VECTOR.signature,
    )
  })

  it('refuses the vector with one byte of the body changed', async () => {
    const verdict = await verify(VECTOR.secret, headers(), '{"test": 2432232315}', AT)
    expect(verdict).toEqual({ ok: false, problem: 'invalid-signature' })
  })

  it('refuses it when the id or the timestamp is not the one signed', async () => {
    expect(await verify(VECTOR.secret, headers({ id: 'msg_other' }), VECTOR.body, AT)).toEqual({
      ok: false,
      problem: 'invalid-signature',
    })
    const later = String(AT + 1)
    expect(await verify(VECTOR.secret, headers({ timestamp: later }), VECTOR.body, AT)).toEqual({
      ok: false,
      problem: 'invalid-signature',
    })
  })

  it('accepts when any one of several signatures verifies, as during a rotation', async () => {
    const signature = `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${VECTOR.signature}`
    expect(await verify(VECTOR.secret, headers({ signature }), VECTOR.body, AT)).toEqual({
      ok: true,
    })
  })

  it('ignores a signature under a version it does not know', async () => {
    const signature = VECTOR.signature.replace(/^v1,/, 'v2,')
    expect(await verify(VECTOR.secret, headers({ signature }), VECTOR.body, AT)).toEqual({
      ok: false,
      problem: 'invalid-signature',
    })
  })

  it('treats a header that is not base64 as a wrong signature, not an error', async () => {
    expect(await verify(VECTOR.secret, headers({ signature: 'v1,***' }), VECTOR.body, AT)).toEqual({
      ok: false,
      problem: 'invalid-signature',
    })
  })

  it('reports missing headers as missing, not as a bad signature', async () => {
    expect(
      await verify(VECTOR.secret, { ...headers(), signature: undefined }, VECTOR.body, AT),
    ).toEqual({ ok: false, problem: 'missing-signature' })
    expect(await verify(VECTOR.secret, { ...headers(), id: undefined }, VECTOR.body, AT)).toEqual({
      ok: false,
      problem: 'missing-signature',
    })
  })

  it('accepts a timestamp at the edge of the tolerance, either way, and not past it', async () => {
    const edge = [AT - TOLERANCE_SECONDS, AT + TOLERANCE_SECONDS]
    for (const now of edge) {
      expect(await verify(VECTOR.secret, headers(), VECTOR.body, now)).toEqual({ ok: true })
    }
    for (const now of [AT - TOLERANCE_SECONDS - 1, AT + TOLERANCE_SECONDS + 1]) {
      expect(await verify(VECTOR.secret, headers(), VECTOR.body, now)).toEqual({
        ok: false,
        problem: 'stale-timestamp',
      })
    }
  })

  /**
   * Each of these is signed correctly, so only the format check can refuse
   * it: `Number()` reads all three as the vector's own time.
   */
  it('refuses a timestamp that is not plain seconds, even when signed', async () => {
    for (const timestamp of ['1.61426533e9', ' 1614265330', '0x6037bbf2']) {
      expect(Number(timestamp)).toBe(AT)
      const signature = await sign(VECTOR.secret, VECTOR.id, timestamp, VECTOR.body)
      const verdict = await verify(
        VECTOR.secret,
        headers({ timestamp, signature }),
        VECTOR.body,
        AT,
      )
      expect(verdict).toEqual({ ok: false, problem: 'invalid-signature' })
    }
  })
})
