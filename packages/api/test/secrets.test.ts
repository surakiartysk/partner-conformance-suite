import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, newToken, sha256Hex } from '../src/secrets'

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)))
const OTHER = btoa(String.fromCharCode(...new Uint8Array(32).fill(2)))

describe('encrypt and decrypt', () => {
  it('round-trips a secret', async () => {
    const sealed = await encrypt('whsec_example', KEY)
    expect(sealed).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
    expect(await decrypt(sealed, KEY)).toBe('whsec_example')
  })

  it('never seals the same secret the same way twice', async () => {
    const [a, b] = await Promise.all([encrypt('same', KEY), encrypt('same', KEY)])
    expect(a).not.toBe(b)
    expect(a.split(':')[1]).not.toBe(b.split(':')[1])
  })

  it('refuses a different key, and a ciphertext changed by one character', async () => {
    const sealed = await encrypt('whsec_example', KEY)
    await expect(decrypt(sealed, OTHER)).rejects.toThrow()
    const [v, iv, body] = sealed.split(':') as [string, string, string]
    const flipped = body.startsWith('A') ? 'B' + body.slice(1) : 'A' + body.slice(1)
    await expect(decrypt(`${v}:${iv}:${flipped}`, KEY)).rejects.toThrow()
  })

  it('refuses a key that is not 32 bytes', async () => {
    await expect(encrypt('x', btoa('sixteen bytes!!!'))).rejects.toThrow(/32 bytes/)
  })
})

describe('tokens', () => {
  it('are URL-safe, long, and different every time', () => {
    // Many of them: one random token has a fair chance of containing no `+` or
    // `/` at all, and would pass whether or not they are replaced.
    const tokens = Array.from({ length: 50 }, newToken)
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Set(tokens).size).toBe(50)
  })

  it('are stored as their SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
