import { describe, expect, it } from 'vitest'
import { newSecret, sign } from '../src/runner/signing'

/** Standard Webhooks' published test vector — the same one the partner's verifier is held to. */
const VECTOR = {
  secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
  timestamp: '1614265330',
  body: '{"test": 2432232314}',
  signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
}

describe('sign', () => {
  it('produces the published test vector', async () => {
    expect(await sign(VECTOR.secret, VECTOR.id, VECTOR.timestamp, VECTOR.body)).toBe(
      VECTOR.signature,
    )
  })

  it('refuses a secret that is not in whsec_ form', async () => {
    await expect(sign('sk_abc', 'id', '1', '')).rejects.toThrow(/whsec_/)
  })
})

describe('newSecret', () => {
  it('is whsec_ and 32 random bytes, different every time', () => {
    const [a, b] = [newSecret(), newSecret()]
    expect(a).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    expect(atob(a.slice('whsec_'.length))).toHaveLength(32)
    expect(a).not.toBe(b)
  })
})
