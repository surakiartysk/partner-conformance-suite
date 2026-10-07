import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { REPLAY_MEMORY_SECONDS } from '../src/app'
import worker from '../src/index'
import { IDS_PURGED_PER_RUN, TENANTS_PURGED_PER_RUN, purge } from '../src/purge'
import { migrate, nowSeconds, problemType, provisionTenant, signed } from './helpers'

beforeAll(migrate)

// The cases below count rows, so each starts from an empty partner. The other
// files share storage within themselves, not with this one.
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM tenants').run() // members, transactions and ids cascade
})

const count = async (table: string, tenant?: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} ${tenant ? 'WHERE tenant = ?' : ''}`)
    .bind(...(tenant ? [tenant] : []))
    .first<{ n: number }>())!.n

const TABLES = ['tenants', 'members', 'transactions', 'seen_messages']
const rowsOf = async (tenant: string) =>
  Promise.all(TABLES.map((t) => (t === 'tenants' ? count(t) : count(t, tenant))))

/** A tenant that has done something: two members, a transaction, and the ids it used. */
async function busyTenant() {
  const tenant = await provisionTenant()
  const earn = await signed(tenant, 'POST', '/points/earn', {
    body: { memberId: tenant.members[0].id, points: 10, reference: 'ref-' + crypto.randomUUID() },
  })
  expect(earn.status).toBe(200)
  return tenant
}

const expire = (id: string) =>
  env.DB.prepare('UPDATE tenants SET expires_at = ? WHERE id = ?')
    .bind(nowSeconds() - 1, id)
    .run()

describe('purge: tenants', () => {
  it('removes a tenant that has expired, with its members, transactions and ids', async () => {
    const tenant = await busyTenant()
    expect(await count('members', tenant.id)).toBe(2)
    expect(await count('transactions', tenant.id)).toBe(1)
    expect(await count('seen_messages', tenant.id)).toBeGreaterThan(0)

    await expire(tenant.id)
    await purge(env.DB, nowSeconds())

    expect(await count('tenants')).toBe(0)
    expect(await count('members')).toBe(0)
    expect(await count('transactions')).toBe(0)
    expect(await count('seen_messages')).toBe(0)
  })

  it('removes a tenant in the very second it expires, as the partner stops answering it', async () => {
    const tenant = await provisionTenant()
    const at = nowSeconds()
    await env.DB.prepare('UPDATE tenants SET expires_at = ? WHERE id = ?').bind(at, tenant.id).run()
    await purge(env.DB, at - 1)
    expect(await count('tenants')).toBe(1)
    await purge(env.DB, at)
    expect(await count('tenants')).toBe(0)
  })

  it('leaves a tenant that has not expired exactly as it was', async () => {
    const kept = await busyTenant()
    const gone = await busyTenant()
    const before = await rowsOf(kept.id)
    await expire(gone.id)

    await purge(env.DB, nowSeconds())

    expect(await count('tenants')).toBe(1)
    expect(await count('members', kept.id)).toBe(before[1])
    expect(await count('transactions', kept.id)).toBe(before[2])
    expect(await count('seen_messages', kept.id)).toBe(before[3])
  })

  it('removes a bounded number a run, and the rest on the next', async () => {
    const extra = 3
    for (let i = 0; i < TENANTS_PURGED_PER_RUN + extra; i++) {
      await env.DB.prepare(
        'INSERT INTO tenants (id, secret, created_at, expires_at) VALUES (?, ?, 1, 2)',
      )
        .bind(`expired-${i}`, 'x')
        .run()
    }
    expect((await purge(env.DB, nowSeconds())).tenants).toBe(TENANTS_PURGED_PER_RUN)
    expect(await count('tenants')).toBe(extra)
    expect((await purge(env.DB, nowSeconds())).tenants).toBe(extra)
    expect(await count('tenants')).toBe(0)
  })
})

describe('purge: webhook-ids', () => {
  const seed = async (tenant: string, id: string, seenAt: number) =>
    env.DB.prepare('INSERT INTO seen_messages (tenant, id, seen_at) VALUES (?, ?, ?)')
      .bind(tenant, id, seenAt)
      .run()

  it('forgets an id older than the memory window and keeps one inside it, to the second', async () => {
    const tenant = await provisionTenant()
    const at = nowSeconds()
    await seed(tenant.id, 'older', at - REPLAY_MEMORY_SECONDS - 1)
    await seed(tenant.id, 'exactly', at - REPLAY_MEMORY_SECONDS)
    await seed(tenant.id, 'recent', at - 1)

    await purge(env.DB, at)

    const left = await env.DB.prepare('SELECT id FROM seen_messages WHERE tenant = ? ORDER BY id')
      .bind(tenant.id)
      .all<{ id: string }>()
    expect(left.results.map((r) => r.id)).toEqual(['exactly', 'recent'])
  })

  it('still refuses a replay inside the window afterwards', async () => {
    const tenant = await provisionTenant()
    const id = 'msg_' + crypto.randomUUID()
    const body = { memberId: tenant.members[0].id }
    expect((await signed(tenant, 'GET', `/members/${body.memberId}`, { id })).status).toBe(200)

    // Seen a minute ago: inside the window, and not in the same second as the purge,
    // so a purge that took every id would not be hidden by the clock.
    await env.DB.prepare('UPDATE seen_messages SET seen_at = ? WHERE tenant = ? AND id = ?')
      .bind(nowSeconds() - 60, tenant.id, id)
      .run()

    await purge(env.DB, nowSeconds())

    const again = await signed(tenant, 'GET', `/members/${body.memberId}`, { id })
    expect(again.status).toBe(409)
    expect(await problemType(again)).toBe('replayed-request')
  })

  it('removes a bounded number a run', async () => {
    const tenant = await provisionTenant()
    const at = nowSeconds()
    const extra = 7
    const insert = env.DB.prepare(
      'INSERT INTO seen_messages (tenant, id, seen_at) VALUES (?, ?, 1)',
    )
    await env.DB.batch(
      Array.from({ length: IDS_PURGED_PER_RUN + extra }, (_, i) =>
        insert.bind(tenant.id, `old-${i}`),
      ),
    )
    expect((await purge(env.DB, at)).ids).toBe(IDS_PURGED_PER_RUN)
    expect(await count('seen_messages')).toBe(extra)
  })
})

describe('the scheduled handler', () => {
  it('runs the purge', async () => {
    const tenant = await busyTenant()
    await expire(tenant.id)

    const ctx = createExecutionContext()
    await worker.scheduled(createScheduledController(), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(await count('tenants')).toBe(0)
  })
})
