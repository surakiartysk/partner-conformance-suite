import { Hono } from 'hono'
import { problem } from './problems'
import { provision } from './provision'
import { getBalance, getMember } from './routes/members'
import { earn, redeem, reverse } from './routes/points'
import { TOLERANCE_SECONDS, verify } from './signature'
import type { Env } from './types'
import { isVariant } from './variants'

/**
 * The reference partner.
 *
 * Everything under `/{variant}/{tenant}` is the Points Partner API exactly as
 * the spec describes it; the prefix is this partner's own way of hosting many
 * copies of itself, and the suite treats the whole prefix as a base URL.
 */

/**
 * How long an accepted webhook-id is remembered: twice the tolerance, not once.
 *
 * A timestamp five minutes ahead of the partner's clock is accepted, and stays
 * acceptable until five minutes after it — ten minutes in all. Remembering an
 * id for only five would let a request signed slightly in the future be
 * replayed once its id had been forgotten but its timestamp had not expired.
 */
export const REPLAY_MEMORY_SECONDS = 2 * TOLERANCE_SECONDS

export const app = new Hono<Env>()

app.post('/_provision', provision)

const BASE = '/:variant/:tenant'

app.use(`${BASE}/*`, async (c, next) => {
  if (!isVariant(c.req.param('variant'))) return problem(c, 'not-found', 'no such variant')

  const now = Math.floor(Date.now() / 1000)
  const tenant = await c.env.DB.prepare('SELECT id, secret, expires_at FROM tenants WHERE id = ?')
    .bind(c.req.param('tenant'))
    .first<{ id: string; secret: string; expires_at: number }>()
  if (!tenant || tenant.expires_at <= now) return problem(c, 'unknown-tenant')

  const rawBody = await c.req.text()
  const verdict = await verify(
    tenant.secret,
    {
      id: c.req.header('webhook-id'),
      timestamp: c.req.header('webhook-timestamp'),
      signature: c.req.header('webhook-signature'),
    },
    rawBody,
    now,
  )
  if (!verdict.ok) return problem(c, verdict.problem)

  // Recorded only once the signature holds, so an unauthenticated request
  // cannot use up an id. The upsert refuses an id seen within the memory
  // window and accepts one last seen before it, in a single statement — a
  // read-then-insert would let two copies of one request both through.
  const recorded = await c.env.DB.prepare(
    `INSERT INTO seen_messages (tenant, id, seen_at) VALUES (?, ?, ?)
     ON CONFLICT (tenant, id) DO UPDATE SET seen_at = excluded.seen_at
       WHERE seen_messages.seen_at < ?`,
  )
    .bind(tenant.id, c.req.header('webhook-id'), now, now - REPLAY_MEMORY_SECONDS)
    .run()
  if (recorded.meta.changes === 0) return problem(c, 'replayed-request')

  c.set('tenant', { id: tenant.id, secret: tenant.secret })
  c.set('rawBody', rawBody)
  await next()
})

app.get(`${BASE}/members/:memberId`, getMember)
app.get(`${BASE}/members/:memberId/balance`, getBalance)
app.post(`${BASE}/points/earn`, earn)
app.post(`${BASE}/points/redeem`, redeem)
app.post(`${BASE}/points/reversals`, reverse)

app.notFound((c) => problem(c, 'not-found'))
