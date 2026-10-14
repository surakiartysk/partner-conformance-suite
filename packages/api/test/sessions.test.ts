import { createExecutionContext, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import api from '../src/index'
import { decrypt, sha256Hex } from '../src/secrets'
import { SESSION_STARTS_ALLOWED, clientKey } from '../src/sessions'
import { apiEnv, callApi, cookieFrom, migrateAll, startSession, toPartner } from './helpers'

beforeAll(migrateAll)

const start = (client: string, init: RequestInit = {}, overrides = {}) =>
  callApi(
    '/sessions',
    { method: 'POST', ...init, headers: { 'cf-connecting-ip': client, ...(init.headers ?? {}) } },
    overrides,
  )

const client = () => `client-${crypto.randomUUID()}`

/**
 * The page is served from the same origin as the API (decision 27), so the API
 * owns `/api` and nothing else. The helpers add the prefix; this goes without.
 */
describe('the API path space', () => {
  const bare = (path: string, method = 'POST') =>
    api.fetch(
      new Request(`https://suite.example${path}`, {
        method,
        headers: { 'cf-connecting-ip': `client-${crypto.randomUUID()}` },
      }),
      apiEnv(),
      createExecutionContext(),
    )

  it('answers 404 to a route without the /api prefix, and starts nothing', async () => {
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>()
    for (const [method, path] of [
      ['POST', '/sessions'],
      ['GET', '/session'],
      ['POST', '/session/secret'],
      ['POST', '/runs'],
      ['GET', '/runs'],
    ] as const) {
      expect((await bare(path, method)).status, `${method} ${path}`).toBe(404)
    }
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>()
    expect(after!.n).toBe(before!.n)
  })

  it('puts security headers on every answer, an error and a missing route included', async () => {
    const answers = [
      await bare('/api/sessions'),
      await bare('/api/session', 'GET'), // 401: no cookie
      await bare('/api/nowhere', 'GET'), // 404
    ]
    expect(answers.map((a) => a.status)).toEqual([201, 401, 404])
    for (const answer of answers) {
      expect(answer.headers.get('x-content-type-options')).toBe('nosniff')
      expect(answer.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('serves the same route under /api', async () => {
    expect((await bare('/api/sessions')).status).toBe(201)
  })
})

describe('POST /api/sessions', () => {
  it('provisions a tenant with two members, and says which', async () => {
    const response = await start(client())
    expect(response.status).toBe(201)
    const body = await response.json<{
      members: { slot: string; id: string }[]
      partner: { tenant: string; versions: string[]; baseUrls: Record<string, string> }
      secret: { revealed: boolean }
    }>()
    expect(body.members.map((m) => m.slot)).toEqual(['A', 'B'])
    expect(body.members[0]!.id).toMatch(/^mbr_/)
    expect(body.partner.versions).toContain('correct')
    expect(body.secret.revealed).toBe(false)
    // Each version's address is the one the runner will build for it.
    for (const version of body.partner.versions) {
      expect(body.partner.baseUrls[version]).toBe(
        `https://partner.example/${version}/${body.partner.tenant}`,
      )
    }
    expect(Object.keys(body.partner.baseUrls).sort()).toEqual([...body.partner.versions].sort())
  })

  it('sets a session cookie that scripts cannot read and other sites do not send', async () => {
    const response = await start(client())
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toMatch(/^session=[A-Za-z0-9_-]{40,};/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/SameSite=Lax/)
  })

  it('stores neither the cookie token nor the signing secret as they are', async () => {
    const response = await start(client())
    const token = cookieFrom(response).split('=')[1]!
    const { secret } = await (
      await callApi('/session/secret', {
        method: 'POST',
        headers: { cookie: cookieFrom(response) },
      })
    ).json<{ secret: string }>()

    const row = await env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ?')
      .bind(await sha256Hex(token))
      .first<Record<string, unknown>>()
    expect(row).not.toBeNull()
    const stored = JSON.stringify(row)
    expect(stored).not.toContain(token)
    expect(stored).not.toContain(secret)
    expect(await decrypt(row!.secret as string, env.SECRET_KEY!)).toBe(secret)
  })

  it('ends when the tenant on the partner ends, and not later', async () => {
    const response = await start(client())
    const body = await response.json<{ expiresAt: string; partner: { tenant: string } }>()
    const tenant = await env.PARTNER_DB.prepare('SELECT expires_at FROM tenants WHERE id = ?')
      .bind(body.partner.tenant)
      .first<{ expires_at: number }>()
    expect(Date.parse(body.expiresAt)).toBe(tenant!.expires_at * 1000)
  })

  it('ignores anything the request says about where the partner is', async () => {
    const response = await start(client(), {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://attacker.example', tenant: 't-mine' }),
    })
    const body = await response.json<{ partner: { tenant: string } }>()
    expect(body.partner.tenant).not.toBe('t-mine')
    expect(body.partner.tenant).toMatch(/^t-[0-9a-f-]{36}$/)
  })

  it('refuses a client past its limit, and not a different one', async () => {
    const busy = client()
    for (let i = 0; i < SESSION_STARTS_ALLOWED; i++) {
      expect((await start(busy)).status).toBe(201)
    }
    const refused = await start(busy)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('3600')
    expect((await start(client())).status).toBe(201)
  })

  it('counts every address in one IPv6 /64 as one client, and another /64 apart', async () => {
    // A machine handed a /64 could otherwise start every session from a new address.
    const [a, b] = [0, 0].map(() => Math.floor(Math.random() * 0xffff))
    const network = `2001:db8:${a!.toString(16)}:${b!.toString(16)}`
    const elsewhere = `2001:db8:${a!.toString(16)}:${(b! + 1).toString(16)}`
    for (let i = 0; i < SESSION_STARTS_ALLOWED; i++) {
      expect((await start(`${network}::${(i + 1).toString(16)}`)).status).toBe(201)
    }
    expect((await start(`${network}:ffff:ffff:ffff:ffff`)).status).toBe(429)
    expect((await start(`${elsewhere}::1`)).status).toBe(201)
  })

  it('reads one /64 however it is written, and anything else as the shared bucket', () => {
    expect(clientKey('2001:db8::1')).toBe('2001:0db8:0000:0000::/64')
    expect(clientKey('2001:0DB8:0:0::2')).toBe('2001:0db8:0000:0000::/64')
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7')
    expect(clientKey('2001:db8::1::2')).toBe('unknown')
    expect(clientKey(undefined)).toBe('unknown')
  })

  it('refuses a start from another site’s page, and charges it nothing', async () => {
    // Starting needs no cookie, so SameSite cannot stop another page doing it.
    const visitor = client()
    const elsewhere: Record<string, string>[] = [
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
      { origin: 'https://elsewhere.example' },
    ]
    for (const headers of elsewhere) {
      expect((await start(visitor, { headers })).status, JSON.stringify(headers)).toBe(403)
    }
    for (let i = 0; i < SESSION_STARTS_ALLOWED; i++) {
      expect((await start(visitor)).status).toBe(201)
    }
  })

  it('takes a start from this site’s own page', async () => {
    expect((await start(client(), { headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(
      201,
    )
    expect((await start(client(), { headers: { origin: 'https://suite.example' } })).status).toBe(
      201,
    )
  })

  it('counts starts that arrive together, rather than letting them all read the same count', async () => {
    const busy = client()
    const statuses = await Promise.all(
      Array.from({ length: SESSION_STARTS_ALLOWED + 3 }, () => start(busy).then((r) => r.status)),
    )
    expect(statuses.filter((s) => s === 201)).toHaveLength(SESSION_STARTS_ALLOWED)
    expect(statuses.filter((s) => s === 429)).toHaveLength(3)
  })

  it('is off, not open, without its secrets — and calls no partner', async () => {
    let called = false
    const spy = { fetch: (r: Request) => ((called = true), toPartner(r)) } as unknown as Fetcher
    expect((await start(client(), {}, { SECRET_KEY: undefined, PARTNER: spy })).status).toBe(503)
    expect((await start(client(), {}, { PROVISION_TOKEN: undefined, PARTNER: spy })).status).toBe(
      503,
    )
    expect(called).toBe(false)
  })

  it('answers 502 and keeps no session when the partner refuses to provision', async () => {
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>()
    const response = await start(client(), {}, { PROVISION_TOKEN: 'wrong-token' })
    expect(response.status).toBe(502)
    expect(response.headers.get('set-cookie')).toBeNull()
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>()
    expect(after!.n).toBe(before!.n)
  })
})

describe('GET /api/session', () => {
  it('shows the session, with each member’s balance read from the partner', async () => {
    const { cookie } = await startSession()
    const response = await callApi('/session', { headers: { cookie } })
    expect(response.status).toBe(200)
    const body = await response.json<{ members: { slot: string; balance: number }[] }>()
    expect(body.members.map((m) => m.balance)).toEqual([1000, 1000])
  })

  it('answers 401 without a cookie, with a made-up one, and with an expired one', async () => {
    expect((await callApi('/session')).status).toBe(401)
    expect((await callApi('/session', { headers: { cookie: 'session=made-up' } })).status).toBe(401)

    const { cookie } = await startSession()
    const token = cookie.split('=')[1]!
    await env.DB.prepare('UPDATE sessions SET expires_at = 0 WHERE token_hash = ?')
      .bind(await sha256Hex(token))
      .run()
    expect((await callApi('/session', { headers: { cookie } })).status).toBe(401)
  })

  it('shows each visitor their own session only', async () => {
    const [mine, theirs] = await Promise.all([startSession(), startSession()])
    const body = await (
      await callApi('/session', { headers: { cookie: mine.cookie } })
    ).json<{
      partner: { tenant: string }
    }>()
    expect(body.partner.tenant).toBe(mine.body.partner.tenant)
    expect(body.partner.tenant).not.toBe(theirs.body.partner.tenant)
  })
})

describe('POST /api/session/secret', () => {
  it('shows the signing secret once, and never again', async () => {
    const { cookie } = await startSession()
    const first = await callApi('/session/secret', { method: 'POST', headers: { cookie } })
    expect(first.status).toBe(200)
    expect((await first.json<{ secret: string }>()).secret).toMatch(/^whsec_/)

    const second = await callApi('/session/secret', { method: 'POST', headers: { cookie } })
    expect(second.status).toBe(410)
    const session = await (
      await callApi('/session', { headers: { cookie } })
    ).json<{
      secret: { revealed: boolean }
    }>()
    expect(session.secret.revealed).toBe(true)
  })

  it('does not use up the one showing when the secret cannot be decrypted', async () => {
    const { cookie } = await startSession()
    // A key other than the one the session was sealed with.
    const wrongKey = { SECRET_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=' }
    const failed = await callApi(
      '/session/secret',
      { method: 'POST', headers: { cookie } },
      wrongKey,
    )
    expect(failed.status).toBe(500)

    const later = await callApi('/session/secret', { method: 'POST', headers: { cookie } })
    expect(later.status).toBe(200)
    expect((await later.json<{ secret: string }>()).secret).toMatch(/^whsec_/)
  })

  it('shows it to only one of two requests that arrive together', async () => {
    const { cookie } = await startSession()
    const statuses = await Promise.all(
      [1, 2, 3].map(() =>
        callApi('/session/secret', { method: 'POST', headers: { cookie } }).then((r) => r.status),
      ),
    )
    expect(statuses.sort()).toEqual([200, 410, 410])
  })

  it('is the secret the partner verifies with', async () => {
    const { cookie, body } = await startSession()
    const { secret } = await (
      await callApi('/session/secret', { method: 'POST', headers: { cookie } })
    ).json<{ secret: string }>()
    const { sign } = await import('../src/runner/signing')
    const id = 'msg_check'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const memberId = body.members[0]!.id
    const response = await toPartner(
      new Request(`https://partner.example/correct/${body.partner.tenant}/members/${memberId}`, {
        headers: {
          'webhook-id': id,
          'webhook-timestamp': timestamp,
          'webhook-signature': await sign(secret, id, timestamp, ''),
        },
      }),
    )
    expect(response.status).toBe(200)
  })
})
