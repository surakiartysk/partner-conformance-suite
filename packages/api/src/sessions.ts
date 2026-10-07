import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { PARTNER_VERSIONS, baseUrl, readBalance, targetFor } from './partner'
import { newSecret } from './runner/signing'
import { decrypt, encrypt, newToken, randomId, sha256Hex } from './secrets'
import type { Bindings, Env, Session } from './types'

/**
 * "Try it": a session, a tenant on the reference partner, and a cookie.
 *
 * Nothing in the request body is read. The partner, its version list and the
 * members all come from the deployment and from what the partner answered when
 * it was provisioned, so a visitor has no way to point the suite elsewhere.
 */

export const COOKIE = 'session'

/** Sessions one client address may start per window. */
export const SESSION_STARTS_ALLOWED = 5
export const SESSION_START_WINDOW_SECONDS = 60 * 60

const now = () => Math.floor(Date.now() / 1000)

/**
 * The client's address as Cloudflare reports it. Absent locally, where every
 * caller shares one bucket — which is the safe direction to be wrong in.
 */
const clientOf = (c: Context) => c.req.header('cf-connecting-ip') ?? 'unknown'

/**
 * Charges one start to the client and returns the count in the window. One
 * statement, so two starts arriving together cannot both read a count under the
 * limit. Charged before provisioning, so a client cannot hammer the partner by
 * starting sessions that then fail.
 */
async function chargeStart(c: Context<Env>): Promise<number> {
  const at = now()
  const row = await c.env.DB.prepare(
    `INSERT INTO session_starts (client, window_start, attempts) VALUES (?1, ?2, 1)
     ON CONFLICT (client) DO UPDATE SET
       attempts = CASE WHEN session_starts.window_start <= ?3 THEN 1
                       ELSE session_starts.attempts + 1 END,
       window_start = CASE WHEN session_starts.window_start <= ?3 THEN ?2
                           ELSE session_starts.window_start END
     RETURNING attempts`,
  )
    .bind(clientOf(c), at, at - SESSION_START_WINDOW_SECONDS)
    .first<{ attempts: number }>()
  return row!.attempts
}

function view(env: Bindings, session: Session, balances?: Record<'A' | 'B', number | null>) {
  return {
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
    partner: {
      tenant: session.tenant,
      versions: PARTNER_VERSIONS,
      // The address each version is reached at, as the runner builds it: what
      // the Connection page shows is what a case is sent to, not a copy of it.
      baseUrls: Object.fromEntries(PARTNER_VERSIONS.map((v) => [v, baseUrl(env, session, v)])),
    },
    members: (['A', 'B'] as const).map((slot) => ({
      slot,
      id: slot === 'A' ? session.member_a : session.member_b,
      ...(balances ? { balance: balances[slot] } : {}),
    })),
    secret: { revealed: session.secret_revealed_at !== null },
  }
}

export async function startSession(c: Context<Env>): Promise<Response> {
  const { SECRET_KEY, PROVISION_TOKEN } = c.env
  if (!SECRET_KEY || !PROVISION_TOKEN) return c.json({ error: 'not configured' }, 503)

  if ((await chargeStart(c)) > SESSION_STARTS_ALLOWED) {
    c.header('retry-after', String(SESSION_START_WINDOW_SECONDS))
    return c.json({ error: 'too many sessions from this address; try again later' }, 429)
  }

  const tenant = 't-' + crypto.randomUUID()
  const secret = newSecret()
  const provisioned = await c.env.PARTNER.fetch(
    new Request(`${c.env.PARTNER_ORIGIN.replace(/\/+$/, '')}/_provision`, {
      method: 'POST',
      headers: { authorization: `Bearer ${PROVISION_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tenant, secret }),
    }),
  )
  if (provisioned.status !== 201) {
    return c.json({ error: `the partner refused to provision (${provisioned.status})` }, 502)
  }
  const { members, expiresAt } = await provisioned.json<{
    members: { id: string }[]
    expiresAt: string
  }>()

  const token = newToken()
  const session: Session = {
    id: randomId('ses_'),
    tenant,
    secret: await encrypt(secret, SECRET_KEY),
    member_a: members[0]!.id,
    member_b: members[1]!.id,
    secret_revealed_at: null,
    created_at: now(),
    expires_at: Math.floor(Date.parse(expiresAt) / 1000),
  }
  await c.env.DB.prepare(
    `INSERT INTO sessions
       (id, token_hash, tenant, secret, member_a, member_b, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      session.id,
      await sha256Hex(token),
      session.tenant,
      session.secret,
      session.member_a,
      session.member_b,
      session.created_at,
      session.expires_at,
    )
    .run()

  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: session.expires_at - session.created_at,
  })
  return c.json(view(c.env, session), 201)
}

export const requireSession: MiddlewareHandler<Env> = async (c, next) => {
  const token = getCookie(c, COOKIE)
  if (!token) return c.json({ error: 'no session' }, 401)
  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?',
  )
    .bind(await sha256Hex(token), now())
    .first<Session>()
  if (!session) return c.json({ error: 'no session' }, 401)
  c.set('session', session)
  await next()
}

export async function getSession(c: Context<Env>): Promise<Response> {
  const session = c.var.session
  const target = await targetFor(c.env, session, 'correct')
  const [a, b] = await Promise.all([
    readBalance(c.env, target, 'A'),
    readBalance(c.env, target, 'B'),
  ])
  return c.json(view(c.env, session, { A: a, B: b }))
}

/**
 * The signing secret, shown once. The UPDATE is the check: of two requests
 * arriving together, only the one that changes the row gets the secret.
 */
export async function revealSecret(c: Context<Env>): Promise<Response> {
  if (!c.env.SECRET_KEY) return c.json({ error: 'not configured' }, 503)
  const session = c.var.session
  // Decrypted before it is claimed: a secret that cannot be decrypted (the key
  // has changed) must not use up the one showing, or it is lost for good. The
  // cost is a decrypt for a request that is then refused with 410.
  const secret = await decrypt(session.secret, c.env.SECRET_KEY)
  const claimed = await c.env.DB.prepare(
    'UPDATE sessions SET secret_revealed_at = ? WHERE id = ? AND secret_revealed_at IS NULL',
  )
    .bind(now(), session.id)
    .run()
  if (claimed.meta.changes === 0) {
    return c.json({ error: 'the secret has already been shown once' }, 410)
  }
  return c.json({ secret })
}
