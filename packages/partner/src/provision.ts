import type { Context } from 'hono'
import { decodeSecret } from './signature'
import type { Env } from './types'

/**
 * Creating a tenant: a signing secret and two members with a starting balance.
 *
 * Not part of the Points Partner API. A real partner is set up by its own
 * onboarding — someone pastes the secret into their configuration and creates
 * test members in their own system. This endpoint stands in for that, so the
 * suite's demo can give each visitor a partner of their own.
 *
 * It creates and never resets. A tenant that already exists is refused rather
 * than overwritten, because a reset would be a back door the suite could use
 * to put a balance right after a run — and a real partner offers no such thing.
 * The suite has to restore balances through the API, like it would anywhere.
 */

export const STARTING_BALANCE = 1000
export const TENANT_LIFETIME_SECONDS = 24 * 60 * 60

const TENANT_ID = /^[a-z0-9-]{8,64}$/

/** The shortest key accepted. Standard Webhooks secrets are 24 to 64 bytes. */
const MIN_KEY_BYTES = 24

const encoder = new TextEncoder()

/**
 * Compares two tokens without leaking where they differ through timing, by
 * comparing their digests. Equal-length digests make the early exit harmless.
 */
async function sameToken(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all(
    [given, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))),
  )
  const left = new Uint8Array(a!)
  const right = new Uint8Array(b!)
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!
  return difference === 0
}

function randomId(prefix: string): string {
  return prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 16)
}

export async function provision(c: Context<Env>): Promise<Response> {
  const expected = c.env.PROVISION_TOKEN
  if (!expected) return c.json({ error: 'provisioning is not configured' }, 503)

  const header = c.req.header('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (!given || !(await sameToken(given, expected))) {
    return c.json({ error: 'unauthorised' }, 401)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'body must be JSON' }, 400)
  }
  const { tenant, secret } = (body ?? {}) as { tenant?: unknown; secret?: unknown }
  if (typeof tenant !== 'string' || !TENANT_ID.test(tenant)) {
    return c.json({ error: 'tenant must be 8-64 of a-z, 0-9 and -' }, 400)
  }
  const key = typeof secret === 'string' ? decodeSecret(secret) : null
  if (!key || key.length < MIN_KEY_BYTES) {
    return c.json({ error: `secret must be whsec_ and at least ${MIN_KEY_BYTES} bytes` }, 400)
  }

  const now = Math.floor(Date.now() / 1000)
  const members = [
    { id: randomId('mbr_'), name: 'Member A', tier: 'standard' },
    { id: randomId('mbr_'), name: 'Member B', tier: 'gold' },
  ]

  // ON CONFLICT DO NOTHING rather than a read first: two provisions of the
  // same id racing would both pass a read, and the second would then add two
  // more members to the first one's tenant.
  const created = await c.env.DB.prepare(
    `INSERT INTO tenants (id, secret, created_at, expires_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  )
    .bind(tenant, secret, now, now + TENANT_LIFETIME_SECONDS)
    .run()
  if (created.meta.changes === 0) return c.json({ error: 'tenant already exists' }, 409)

  await c.env.DB.batch(
    members.map((member) =>
      c.env.DB.prepare(
        'INSERT INTO members (tenant, id, name, tier, balance) VALUES (?, ?, ?, ?, ?)',
      ).bind(tenant, member.id, member.name, member.tier, STARTING_BALANCE),
    ),
  )

  return c.json(
    {
      tenant,
      expiresAt: new Date((now + TENANT_LIFETIME_SECONDS) * 1000).toISOString(),
      members: members.map((member) => ({ ...member, balance: STARTING_BALANCE })),
    },
    201,
  )
}
