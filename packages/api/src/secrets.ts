/**
 * Keeping signing secrets encrypted at rest.
 *
 * A signing secret cannot be hashed the way a password is: the suite needs the
 * secret itself to sign every request. So it is encrypted with AES-GCM under a
 * key held as a Worker secret, and the database holds only `v1:iv:ciphertext`.
 * A copy of the database without the key reveals nothing; a copy of both
 * reveals everything, which decision 21 states as the cost.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key)
  if (raw.length !== 32) throw new Error('SECRET_KEY must be 32 bytes, base64')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encrypt(plaintext: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  )
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(sealed))}`
}

export async function decrypt(stored: string, base64Key: string): Promise<string> {
  const [version, iv, sealed] = stored.split(':')
  if (version !== 'v1' || !iv || !sealed) throw new Error('not an encrypted secret')
  const key = await importKey(base64Key)
  const opened = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(sealed),
  )
  return decoder.decode(opened)
}

/** A random token, URL-safe, for a session cookie. */
export function newToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const randomId = (prefix: string) =>
  prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 20)
