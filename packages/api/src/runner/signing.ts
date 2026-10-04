/**
 * Signing a request the Standard Webhooks way, on the provider's side.
 *
 * Deliberately not shared with the reference partner's verifier. If one module
 * did both, a mistake in it would sign and verify consistently and every case
 * would pass against the reference partner while failing against every real
 * one. This module is held to the standard's published test vector on its own
 * (test/signing.test.ts), as the partner's verifier is on its.
 */

const encoder = new TextEncoder()

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const PREFIX = 'whsec_'

/** A new signing secret: 32 random bytes, in the standard's `whsec_` form. */
export function newSecret(): string {
  return PREFIX + toBase64(crypto.getRandomValues(new Uint8Array(32)))
}

/** `v1,{base64 HMAC-SHA256 of "id.timestamp.body"}` under the secret's key. */
export async function sign(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): Promise<string> {
  if (!secret.startsWith(PREFIX)) throw new Error('signing secret must start with whsec_')
  const key = await crypto.subtle.importKey(
    'raw',
    fromBase64(secret.slice(PREFIX.length)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${id}.${timestamp}.${body}`),
  )
  return `v1,${toBase64(signature)}`
}
