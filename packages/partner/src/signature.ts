/**
 * Verifying a request signed the Standard Webhooks way.
 *
 * Written against the standard rather than against the provider's signer in
 * this repository. If both sides shared one implementation, a mistake in it
 * would sign and verify consistently and every test would pass; pinning this
 * side to the standard's published test vector is what makes the two
 * independent. See test/signature.test.ts.
 */

/** How far a timestamp may be from the partner's clock, either way. */
export const TOLERANCE_SECONDS = 5 * 60

export interface SignedHeaders {
  id: string | undefined
  timestamp: string | undefined
  signature: string | undefined
}

export type Verdict =
  | { ok: true }
  | { ok: false; problem: 'missing-signature' | 'invalid-signature' | 'stale-timestamp' }

const encoder = new TextEncoder()

/** `whsec_` + base64 key → the key bytes, or null when it is not one. */
export function decodeSecret(secret: string): Uint8Array | null {
  if (!secret.startsWith('whsec_')) return null
  return decodeBase64(secret.slice('whsec_'.length))
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

export async function verify(
  secret: string,
  headers: SignedHeaders,
  body: string,
  nowSeconds: number,
): Promise<Verdict> {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) return { ok: false, problem: 'missing-signature' }

  // Seconds only. `Number('')`, `Number('1e9')` and `Number(' 12 ')` all parse,
  // and a timestamp that means something different to each side is not one.
  if (!/^[0-9]+$/.test(timestamp)) return { ok: false, problem: 'invalid-signature' }
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) {
    return { ok: false, problem: 'stale-timestamp' }
  }

  const keyBytes = decodeSecret(secret)
  if (!keyBytes) throw new Error('tenant secret is not a whsec_ key')
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signed = encoder.encode(`${id}.${timestamp}.${body}`)

  // Several signatures may be present while a secret is being rotated; any
  // one that verifies is enough. `crypto.subtle.verify` compares in constant
  // time, which a string comparison of two base64 values would not.
  for (const entry of signature.split(' ')) {
    const [version, value] = entry.split(',', 2)
    if (version !== 'v1' || !value) continue
    const candidate = decodeBase64(value)
    if (!candidate) continue
    if (await crypto.subtle.verify('HMAC', key, candidate, signed)) return { ok: true }
  }
  return { ok: false, problem: 'invalid-signature' }
}
